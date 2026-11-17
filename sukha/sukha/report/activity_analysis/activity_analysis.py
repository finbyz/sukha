# Copyright (c) 2026, Finbyz Tech Pvt Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import get_timespan_date_range
from frappe.utils.user import get_user_fullname

# Per-doctype settings. Table and field names come only from here, never from user input.
#   posting_date: date field used when Based On = "Posting Date" (None falls back to creation)
#   child: items table, with item_field / amount_expr read from it
#   child = None: the doctype holds one item on the parent; item_field / amount_field are read
#     from the parent, and the doc counts as one item when item_field is set
#   item_link: item_field stores an Item code, so show Item.item_name instead
#   fallback_field: parent field used when item_field is empty
#   title: fallback title field when no Property Setter / DocType title_field is set
DOCTYPE_CONFIG = {
	"Lead": {
		"posting_date": None,
		"child": None,
		"item_field": "custom_product_from_l1",
		"item_link": True,
		"fallback_field": "custom_product_name_i",  # leads without the L2 tab filled
		"amount_field": None,
		"title": "title",
	},
	"Opportunity": {
		"posting_date": "transaction_date",
		"child": None,
		"item_field": "custom_item_name",
		"amount_field": None,
		"title": "title",
	},
	"Prospect": {
		"posting_date": None,
		"child": None,
		"item_field": "custom_item_name",
		"amount_field": None,
		"title": "company_name",
	},
	"Cost Sheet": {
		"posting_date": "cost_sheet_date",
		"child": None,
		"item_field": "product",
		"item_link": True,
		"amount_field": "final_offered_price",
		"title": "cost_sheet_name",
	},
	"Quotation": {
		"posting_date": "transaction_date",
		"child": "Quotation Item",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "customer_name",
	},
	"Blanket Order": {
		"posting_date": "order_date",
		"child": "Blanket Order Item",
		"item_field": "item_name",
		"amount_expr": "child.qty * child.rate",
		"title": "customer_name",
	},
	"Sales Order": {
		"posting_date": "transaction_date",
		"child": "Sales Order Item",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "customer_name",
	},
	"Purchase Order": {
		"posting_date": "transaction_date",
		"child": "Purchase Order Item",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "supplier_name",
	},
	"Purchase Receipt": {
		"posting_date": "posting_date",
		"child": "Purchase Receipt Item",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "supplier_name",
	},
	"Purchase Invoice": {
		"posting_date": "posting_date",
		"child": "Purchase Invoice Item",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "supplier_name",
	},
	"Delivery Note": {
		"posting_date": "posting_date",
		"child": "Delivery Note Item",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "customer_name",
	},
	"Sales Invoice": {
		"posting_date": "posting_date",
		"child": "Sales Invoice Item",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "customer_name",
	},
	"Stock Entry": {
		"posting_date": "posting_date",
		"child": "Stock Entry Detail",
		"item_field": "item_name",
		"amount_expr": "child.amount",
		"title": "stock_entry_type",
	},
	"Journal Entry": {
		"posting_date": "posting_date",
		"child": "Journal Entry Account",
		"item_field": "account",
		"amount_expr": "IF(child.credit > 0, child.credit, child.debit)",
		"title": "title",
	},
	"Payment Entry": {
		"posting_date": "posting_date",
		"child": None,
		"item_field": "party_name",
		"amount_field": "paid_amount",
		"title": "title",
	},
	"Job Card": {
		# One production item per card; Amount shows the quantity to produce
		"posting_date": "posting_date",
		"child": None,
		"item_field": "production_item",
		"item_link": True,
		"amount_field": "for_quantity",
		"title": "operation",
	},
}


def execute(filters=None):
	filters = frappe._dict(frappe.parse_json(filters or {}))

	if filters.get("timespan"):
		filters.from_date, filters.to_date = get_timespan_date_range(filters.timespan)

	if filters.get("doctype") and filters.doctype not in DOCTYPE_CONFIG:
		return [], []

	if filters.get("show_details"):
		columns = get_columns_details()
		data = get_data_details(filters)
		chart = get_chart_data_details(data)
	else:
		columns = get_columns()
		data = get_data(filters)
		chart = get_chart_data(data)

	return columns, data, None, chart


def get_doctypes(filters):
	return [filters.doctype] if filters.get("doctype") else list(DOCTYPE_CONFIG)


def get_conditions(doc, filters, alias="p"):
	"""Return a WHERE fragment and its values for the parent table."""
	cfg = DOCTYPE_CONFIG[doc]
	if filters.get("based_on") == "Posting Date" and cfg["posting_date"]:
		date = f"{alias}.`{cfg['posting_date']}`"
	else:
		date = f"DATE({alias}.creation)"

	conditions = ""
	values = {}
	if filters.get("from_date"):
		conditions += f" and {date} >= %(from_date)s"
		values["from_date"] = filters.from_date
	if filters.get("to_date"):
		conditions += f" and {date} <= %(to_date)s"
		values["to_date"] = filters.to_date
	if filters.get("user"):
		conditions += f" and {alias}.owner = %(user)s"
		values["user"] = filters.user

	return date, conditions, values


def get_title_field(doc):
	title_field = frappe.db.get_value(
		"Property Setter", {"doc_type": doc, "property": "title_field"}, "value"
	) or frappe.db.get_value("DocType", doc, "title_field")

	meta = frappe.get_meta(doc)
	if title_field and meta.has_field(title_field):
		return title_field

	fallback = DOCTYPE_CONFIG[doc]["title"]
	return fallback if meta.has_field(fallback) else "name"


# ---------------------------------------------------------------- details


def get_columns_details():
	return [
		{"label": _("Document"), "fieldname": "Document", "fieldtype": "Data", "width": 120},
		{"label": _("ID"), "fieldname": "ID", "fieldtype": "Dynamic Link", "options": "Document", "width": 140},
		{"label": _("Date"), "fieldname": "Date", "fieldtype": "Date", "width": 100},
		{"label": _("Created By"), "fieldname": "Created By", "fieldtype": "Data", "width": 150},
		{"label": _("Title"), "fieldname": "Title", "fieldtype": "Data", "width": 180},
		{"label": _("Item Name"), "fieldname": "Item Name", "fieldtype": "Data", "width": 180},
		{"label": _("Amount"), "fieldname": "Amount", "fieldtype": "Currency", "width": 150},
	]


def get_data_details(filters):
	data = []
	fullnames = {}

	def fullname(user):
		if user not in fullnames:
			fullnames[user] = get_user_fullname(user) if user else ""
		return fullnames[user]

	for doc in get_doctypes(filters):
		cfg = DOCTYPE_CONFIG[doc]
		date, conditions, values = get_conditions(doc, filters)
		title_field = get_title_field(doc)

		extra, join = "", ""
		if not cfg["child"]:
			item_expr, join = get_parent_item_expr(cfg)
			amount = f"p.`{cfg['amount_field']}`" if cfg.get("amount_field") else "NULL"
			extra = f", {item_expr} as item_name, {amount} as amount"

		parents = frappe.db.sql(
			f"""
			SELECT
				p.name, {date} as date, p.owner, p.`{title_field}` as title {extra}
			FROM
				`tab{doc}` p {join}
			WHERE
				p.docstatus < 2
				{conditions}
			ORDER BY
				p.modified DESC
			""",
			values,
			as_dict=1,
		)

		items_by_parent = get_items_by_parent(doc, [d.name for d in parents]) if cfg["child"] else {}

		for parent in parents:
			row = {
				"Document": doc,
				"ID": parent.name,
				"Date": parent.date,
				"Created By": fullname(parent.owner),
				"Title": parent.title,
			}
			data.append(row)

			if not cfg["child"]:
				row["Item Name"] = parent.item_name
				row["Amount"] = parent.amount
				if parent.item_name:
					row["Owner"] = fullname(parent.owner)
				continue

			items = items_by_parent.get(parent.name, [])
			if items:
				row["Item Name"] = items[0].item_name
				row["Amount"] = items[0].amount
				row["Owner"] = fullname(items[0].owner)
			for item in items[1:]:
				data.append(
					{"Item Name": item.item_name, "Amount": item.amount, "Owner": fullname(item.owner)}
				)

	return data


def get_parent_item_expr(cfg):
	"""SQL expression and join for an item held on the parent (doctypes without a child table)."""
	field = f"p.`{cfg['item_field']}`"
	parts, join = [f"NULLIF({field}, '')"], ""
	if cfg.get("item_link"):
		parts.insert(0, "NULLIF(item.item_name, '')")
		join = f"LEFT JOIN `tabItem` item ON item.name = {field}"
	if cfg.get("fallback_field"):
		parts.append(f"NULLIF(p.`{cfg['fallback_field']}`, '')")
	return f"COALESCE({', '.join(parts)})", join


def get_parent_has_item(cfg):
	"""SQL condition: the parent document holds an item (item_field or fallback_field set)."""
	fields = [cfg["item_field"]] + ([cfg["fallback_field"]] if cfg.get("fallback_field") else [])
	return " OR ".join(f"IFNULL(p.`{f}`, '') != ''" for f in fields)


def get_items_by_parent(doc, parent_names):
	if not parent_names:
		return {}

	cfg = DOCTYPE_CONFIG[doc]
	items = frappe.db.sql(
		f"""
		SELECT
			child.parent, child.`{cfg['item_field']}` as item_name,
			{cfg['amount_expr']} as amount, child.owner
		FROM
			`tab{cfg['child']}` child
		WHERE
			child.parenttype = %(doctype)s
			and child.parent in %(parents)s
		ORDER BY
			child.idx
		""",
		{"doctype": doc, "parents": parent_names},
		as_dict=1,
	)

	out = {}
	for item in items:
		out.setdefault(item.parent, []).append(item)
	return out


def get_chart_data_details(data):
	created_by = [row.get("Created By", "") for row in data]
	item_owners = [row.get("Owner", "") for row in data]

	labels, total_entries, total_items = [], [], []
	for user in set(created_by):
		if user:
			labels.append(user)
			total_entries.append(created_by.count(user))
			total_items.append(item_owners.count(user))

	return make_chart(labels, total_entries, total_items)


# ---------------------------------------------------------------- summary


def get_columns():
	return [
		{"label": _("Created By"), "fieldname": "created_by", "fieldtype": "Data", "width": 200},
		{"label": _("Total Entries"), "fieldname": "total_entries", "fieldtype": "Int", "width": 150},
		{"label": _("Total Items"), "fieldname": "total_items", "fieldtype": "Int", "width": 150},
	]


def get_data(filters):
	entries_sum, items_sum = {}, {}

	for doc in get_doctypes(filters):
		cfg = DOCTYPE_CONFIG[doc]
		_date, conditions, values = get_conditions(doc, filters)

		# Without a child table, a document counts as one item when its item field is set
		parent_items = "0"
		if not cfg["child"]:
			parent_items = f"SUM({get_parent_has_item(cfg)})"

		entries = frappe.db.sql(
			f"""
			SELECT p.owner, count(p.name) as total_entries, {parent_items} as total_items
			FROM `tab{doc}` p
			WHERE p.docstatus < 2 {conditions}
			GROUP BY p.owner
			""",
			values,
			as_dict=1,
		)
		for row in entries:
			entries_sum[row.owner] = entries_sum.get(row.owner, 0) + row.total_entries
			items_sum[row.owner] = items_sum.get(row.owner, 0) + int(row.total_items or 0)

		if not entries or not cfg["child"]:
			continue

		# Count only child rows created by the same user who created the parent
		items = frappe.db.sql(
			f"""
			SELECT child.owner, count(child.name) as total_items
			FROM `tab{cfg['child']}` child
			JOIN `tab{doc}` p
				ON p.name = child.parent and p.owner = child.owner
			WHERE
				child.parenttype = %(doctype)s
				and p.docstatus < 2 {conditions}
			GROUP BY child.owner
			""",
			{**values, "doctype": doc},
			as_dict=1,
		)
		for row in items:
			items_sum[row.owner] = items_sum.get(row.owner, 0) + row.total_items

	data = [
		{
			"created_by": get_user_fullname(owner),
			"total_entries": entries_sum.get(owner, 0),
			"total_items": items_sum.get(owner, 0),
		}
		for owner in entries_sum
	]
	data.sort(key=lambda d: d["total_entries"], reverse=True)
	return data


def get_chart_data(data):
	return make_chart(
		[row["created_by"] for row in data],
		[row["total_entries"] for row in data],
		[row["total_items"] for row in data],
	)


def make_chart(labels, total_entries, total_items):
	datasets = []
	if total_entries:
		datasets.append({"name": _("Total Entries"), "values": total_entries})
	if total_items:
		datasets.append({"name": _("Total Items"), "values": total_items})

	return {"data": {"labels": labels, "datasets": datasets}, "type": "bar"}
