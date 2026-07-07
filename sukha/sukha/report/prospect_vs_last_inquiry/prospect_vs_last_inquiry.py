# Copyright (c) 2026, Finbyz Tech Pvt Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, today


def execute(filters: dict = None) -> tuple[list, list]:
	"""Entry point for the Prospect vs Last Inquiry report."""
	if filters is None:
		filters = {}

	columns = get_columns()
	data = get_report_data(filters)

	return columns, data


def get_columns() -> list[dict]:
	"""Defines and returns the report columns."""
	return [
		{
			"label": _("L3 Name"),
			"fieldname": "l3_name",
			"fieldtype": "Link",
			"options": "Prospect",
			"width": 150
		},
		{
			"label": _("Product"),
			"fieldname": "product",
			"fieldtype": "Link",
			"options": "Item",
			"width": 150
		},
		{
			"label": _("Product Name"),
			"fieldname": "product_name",
			"fieldtype": "Data",
			"width": 200
		},
		{
			"label": _("Product Owner"),
			"fieldname": "product_owner",
			"fieldtype": "Link",
			"options": "User",
			"width": 150
		},
		{
			"label": _("Inquiry Owner"),
			"fieldname": "inquiry_owner",
			"fieldtype": "Link",
			"options": "Employee",
			"width": 150
		},
		{
			"label": _("Last Inquiry"),
			"fieldname": "last_inquiry",
			"fieldtype": "Date",
			"width": 120
		},
		{
			"label": _("Type"),
			"fieldname": "type",
			"fieldtype": "Select",
			"options": "\nDomestic\nExport\nMerchant",
			"width": 150
		},
		{
			"label": _("Days Since"),
			"fieldname": "days_since",
			"fieldtype": "Int",
			"width": 100
		},
		{
			"label": _("Total Inquiry"),
			"fieldname": "total_inquiry",
			"fieldtype": "Int",
			"width": 120
		},
		{
			"label": _("Total Qty"),
			"fieldname": "total_qty",
			"fieldtype": "Float",
			"width": 120
		}
	]


def get_report_data(filters: dict) -> list[dict]:
	"""Fetches, groups, and maps the data to prepare final report rows."""
	# 1. Fetch filtered Prospects
	leads = get_prospects(filters)
	if not leads:
		return []

	prospect_names = [d.name for d in leads]

	# 2. Get Prospect-to-Lead mappings
	prospects_by_lead, all_lead_names = get_prospect_leads_map(prospect_names)

	# 3. Fetch all matching Opportunities (Inquiries)
	opportunities = get_opportunities(prospect_names, all_lead_names, filters)

	# 4. Group Opportunities by Prospect
	inquiries_by_prospect = group_opportunities_by_prospect(
		opportunities, prospects_by_lead, prospect_names
	)

	# 5. Map each Prospect to its OWN inquiries (the `opportunities` child table
	#    shown in the Connections tab) for accurate per-prospect counts.
	own_opps_by_prospect = get_prospect_own_opportunities(prospect_names)

	# 6. Prepare final report rows
	return prepare_report_rows(leads, inquiries_by_prospect, own_opps_by_prospect, filters)


def get_prospects(filters: dict) -> list[dict]:
	"""Retrieves Prospect records, filtered by product if provided."""
	lead_filters = {}
	if filters.get("product"):
		lead_filters["custom_product_name"] = filters["product"]

	return frappe.get_all(
		"Prospect",
		filters=lead_filters,
		fields=["name", "custom_product_name", "custom_prroduct_p"]
	)


def get_prospect_leads_map(prospect_names: list[str]) -> tuple[dict, list[str]]:
	"""Fetches the linked leads from the Prospect Lead child table and maps them."""
	prospect_leads = frappe.get_all(
		"Prospect Lead",
		filters={"parent": ["in", prospect_names]},
		fields=["parent", "lead"]
	)

	from collections import defaultdict
	prospects_by_lead = defaultdict(list)
	all_lead_names = set()
	for pl in prospect_leads:
		if pl.lead:
			prospects_by_lead[pl.lead].append(pl.parent)
			all_lead_names.add(pl.lead)

	return prospects_by_lead, list(all_lead_names)


def get_opportunities(prospect_names: list[str], lead_names: list[str], filters: dict) -> list[dict]:
	"""Fetches all matching Opportunity records using a secure SQL query to avoid N+1 issues."""
	# Handle empty lists to prevent SQL syntax errors
	lead_names_list = lead_names if lead_names else [""]
	prospect_names_list = prospect_names if prospect_names else [""]

	opp_conditions = []
	opp_params = {
		"prospect_names": prospect_names_list,
		"lead_names": lead_names_list
	}

	# Match directly via Prospect or indirectly via Lead links
	opp_conditions.append(
		"((opportunity_from = 'Prospect' AND party_name IN %(prospect_names)s) OR (opportunity_from = 'Lead' AND party_name IN %(lead_names)s) OR (custom_lead_number IN %(lead_names)s))"
	)

	if filters.get("product_owner"):
		opp_conditions.append("opportunity_owner = %(product_owner)s")
		opp_params["product_owner"] = filters["product_owner"]

	# Custom buyer type mapping (empty string / NULL is mapped as Export)
	if filters.get("type"):
		if filters["type"] == "Export":
			opp_conditions.append("(custom_buyer_type = 'Export' OR custom_buyer_type IS NULL OR custom_buyer_type = '')")
		else:
			opp_conditions.append("custom_buyer_type = %(type)s")
			opp_params["type"] = filters["type"]

	if filters.get("from_date"):
		opp_conditions.append("transaction_date >= %(from_date)s")
		opp_params["from_date"] = filters["from_date"]

	if filters.get("to_date"):
		opp_conditions.append("transaction_date <= %(to_date)s")
		opp_params["to_date"] = filters["to_date"]

	query = f"""
		SELECT name, party_name, opportunity_from, opportunity_owner, custom_product_owner,
		       custom_buyer_type, transaction_date, creation, custom_total_qty_inquired, custom_lead_number
		FROM `tabOpportunity`
		WHERE {" AND ".join(opp_conditions)}
		ORDER BY creation DESC
	"""
	return frappe.db.sql(query, opp_params, as_dict=True)


def group_opportunities_by_prospect(
	opportunities: list[dict], prospects_by_lead: dict, prospect_names: list[str]
) -> dict:
	"""Groups Opportunities by parent Prospect name, checking direct and indirect links."""
	from collections import defaultdict
	inquiries_by_prospect = defaultdict(list)

	for opp in opportunities:
		added_to = set()
		if opp.opportunity_from == "Prospect" and opp.party_name in prospect_names:
			inquiries_by_prospect[opp.party_name].append(opp)
			added_to.add(opp.party_name)
		
		# Check indirect links via Lead
		linked_leads = []
		if opp.opportunity_from == "Lead" and opp.party_name:
			linked_leads.append(opp.party_name)
		if opp.custom_lead_number:
			linked_leads.append(opp.custom_lead_number)
			
		for lead_name in linked_leads:
			for p_name in prospects_by_lead.get(lead_name, []):
				if p_name not in added_to:
					inquiries_by_prospect[p_name].append(opp)
					added_to.add(p_name)

	return inquiries_by_prospect


def get_prospect_own_opportunities(prospect_names: list[str]) -> dict:
	"""Maps each Prospect to the set of Opportunity names in its own `opportunities`
	child table (Prospect Opportunity).

	This is the exact per-prospect association shown in the Prospect's Connections
	tab. Using it for counts avoids the shared-Lead over-counting, where two
	Prospects linked to the same Lead each reported all of that Lead's inquiries.
	"""
	from collections import defaultdict

	rows = frappe.get_all(
		"Prospect Opportunity",
		filters={"parent": ["in", prospect_names]},
		fields=["parent", "opportunity"]
	)
	own = defaultdict(set)
	for r in rows:
		if r.opportunity:
			own[r.parent].add(r.opportunity)
	return own


def prepare_report_rows(leads: list[dict], inquiries_by_prospect: dict, own_opps_by_prospect: dict, filters: dict) -> list[dict]:
	"""Generates final report rows, aggregating quantities and calculating days since last inquiry."""
	data = []
	has_inquiry_filter = any(filters.get(f) for f in ["product_owner", "type", "from_date", "to_date"])
	current_date = getdate(today())

	# Build an Item -> item_name map for the "Product Name" column (single bulk query)
	product_codes = {
		(lead.custom_product_name or lead.custom_prroduct_p)
		for lead in leads
		if (lead.custom_product_name or lead.custom_prroduct_p)
	}
	item_names = {}
	if product_codes:
		for item in frappe.get_all(
			"Item", filters={"name": ["in", list(product_codes)]}, fields=["name", "item_name"]
		):
			item_names[item.name] = item.item_name

	for lead in leads:
		opps = inquiries_by_prospect.get(lead.name, [])
		
		# If inquiry filters are active and this lead has no matching inquiries, exclude it
		if not opps and has_inquiry_filter:
			continue

		# Per-prospect "own" inquiries: the subset of the linked inquiries that are
		# actually in this Prospect's `opportunities` child table (Prospect
		# Opportunity) — the same set shown in the Connections tab. Counting these,
		# instead of every inquiry reachable through a shared Lead, prevents the
		# over-counting where two Prospects sharing a Lead each reported all of that
		# Lead's inquiries. Existing report filters still apply because we intersect
		# with the already-filtered `opps`.
		own_names = own_opps_by_prospect.get(lead.name, set())
		count_opps = [o for o in opps if o.name in own_names]

		if opps:
			latest_opp = opps[0]

			# Product Owner / Inquiry Owner / Type stay derived from the latest linked
			# inquiry exactly as before — these columns are verified correct and must
			# not change.
			product_owner = latest_opp.opportunity_owner
			inquiry_owner = latest_opp.custom_product_owner
			opp_type = latest_opp.custom_buyer_type or "Export"
		else:
			product_owner = None
			inquiry_owner = None
			opp_type = None

		# Total Inquiry / Total Qty and Last Inquiry / Days Since now reflect only
		# this Prospect's OWN inquiries, so the report agrees with the Connections tab.
		if count_opps:
			# "Last Inquiry" must be the most recent inquiry DATE across the
			# prospect's own inquiries, not the transaction_date of the most recently
			# created record.
			inquiry_dates = []
			for o in count_opps:
				d = o.transaction_date or (o.creation.date() if o.creation else None)
				if isinstance(d, str):
					d = getdate(d)
				if d:
					inquiry_dates.append(d)
			last_inquiry_date = max(inquiry_dates) if inquiry_dates else None
			days_since = date_diff(current_date, last_inquiry_date) if last_inquiry_date else None
			total_inquiry = len(count_opps)
			total_qty = sum(flt(o.custom_total_qty_inquired) for o in count_opps)
		else:
			last_inquiry_date = None
			days_since = None
			total_inquiry = 0
			total_qty = 0.0

		product = lead.custom_product_name or lead.custom_prroduct_p
		row = {
			"l3_name": lead.name,
			"product": product,
			"product_name": item_names.get(product),
			"product_owner": product_owner,
			"inquiry_owner": inquiry_owner,
			"last_inquiry": last_inquiry_date,
			"type": opp_type,
			"days_since": days_since,
			"total_inquiry": total_inquiry,
			"total_qty": total_qty
		}
		data.append(row)

	return data
