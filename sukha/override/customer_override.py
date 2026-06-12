# Copyright (c) 2024, FinByz Tech Pvt Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc


@frappe.whitelist()
def make_opportunity(source_name, target_doc=None):

	def _safe_get(source, fieldname, default=None):
		"""Return field value if it has content, else default."""
		val = getattr(source, fieldname, None)
		return val if val not in (None, "", 0, []) else default

	def set_missing_values(source, target):
		# ── Standard link fields ──────────────────────────────────────────────
		target.opportunity_from = "Customer"
		target.pincode = source.custom_picode
		target.party_name = source.name
		target.customer_name = source.customer_name
		target.customer_group = source.customer_group

		# ── opportunity_type logic ────────────────────────────────────────────
		opportunity_type = "Repeated Enquiry"

		type_of_buyer = _safe_get(source, "custom_type_of_buyer")
		specific_category = _safe_get(source, "custom_specific_customer_category")

		if type_of_buyer:
			opportunity_type = "Repeated Enquiry - Export"
		elif specific_category == "Domestic":
			opportunity_type = "Repeated Enquiry - Domestic"
		elif specific_category == "Merchant":
			opportunity_type = "Repeated Enquiry - Merchant"

		target.opportunity_type = opportunity_type

		# ── Posting / transaction date ────────────────────────────────────────
		if not target.transaction_date:
			target.transaction_date = frappe.utils.today()
		target.custom_posting_date = frappe.utils.today()

		# ══ CUSTOM FIELD MAPPINGS ════════════════════════════════════════════

		# -- Buyer / Type classification -------------------------------------
		# custom_type_of_buyer (same name on both)
		if type_of_buyer:
			target.custom_type_of_buyer = type_of_buyer

		# custom_specific_customer_category → custom_buyer_type
		if specific_category:
			target.custom_buyer_type = specific_category

		# -- Product details -------------------------------------------------
		# custom_product_name (same name)
		product_name = _safe_get(source, "custom_product_name")
		if product_name:
			target.custom_product_name = product_name

		# custom_product_grade (same name)
		product_grade = _safe_get(source, "custom_product_grade")
		if product_grade:
			target.custom_product_grade = product_grade

		# -- Commercial / logistics terms ------------------------------------
		# custom_approved_incoterms → custom_incoterm
		approved_incoterms = _safe_get(source, "custom_approved_incoterms")
		if approved_incoterms:
			target.custom_incoterm = approved_incoterms

		# custom_approved_payment_terms → custom_customer_desired_payment_terms
		approved_payment_terms = _safe_get(source, "custom_approved_payment_terms")
		if approved_payment_terms:
			target.custom_customer_desired_payment_terms = approved_payment_terms

		# custom_current_supplier → custom_preferred_supplier
		current_supplier = _safe_get(source, "custom_current_supplier")
		if current_supplier:
			target.custom_preferred_supplier = current_supplier

		# -- Packing ---------------------------------------------------------
		# custom_approved_packing (Export) / custom_approved_packing_p (Domestic) → custom_packing_type
		approved_packing = (
			_safe_get(source, "custom_approved_packing")
			or _safe_get(source, "custom_approved_packing_p")
		)
		if approved_packing:
			target.custom_packing_type = approved_packing

		# -- Quantity --------------------------------------------------------
		# custom_desired_annual_qty / custom_desired_annual_qty_p → custom_total_qty_inquired
		desired_qty = (
			_safe_get(source, "custom_desired_annual_qty")
			or _safe_get(source, "custom_desired_annual_qty_p")
		)
		if desired_qty:
			target.custom_total_qty_inquired = desired_qty

		# -- Destination / Delivery ------------------------------------------
		# custom_approved_delivery_terms / custom_apporved_delivery_terms →
		#   custom_destination__place_of_delivery
		delivery_terms = (
			_safe_get(source, "custom_approved_delivery_terms")
			or _safe_get(source, "custom_apporved_delivery_terms")
			or _safe_get(source, "custom_place_of_delivery")
			or _safe_get(source, "custom_place_of_delivery_p")
		)
		if delivery_terms:
			target.custom_destination__place_of_delivery = delivery_terms

		# -- Bill-to / Ship-to country ---------------------------------------
		# custom_bill_to_party_country (same name)
		bill_to_country = _safe_get(source, "custom_bill_to_party_country")
		if bill_to_country:
			target.custom_bill_to_party_country = bill_to_country

		# -- Contact ---------------------------------------------------------
		# custom_contact_person_for_active_inquery → custom_contact_person
		contact_person = _safe_get(source, "custom_contact_person_for_active_inquery")
		if contact_person:
			target.custom_contact_person = contact_person

		# custom_contact_number → custom_contact_details
		contact_number = (
			_safe_get(source, "custom_contact_number")
			or _safe_get(source, "custom_contact_number_d")
		)
		if contact_number:
			target.custom_contact_details = str(contact_number)

		# -- Remarks ---------------------------------------------------------
		# custom_remarks → custom_remark
		remarks = _safe_get(source, "custom_remarks")
		if remarks:
			target.custom_remark = remarks

		# -- Preferred shipping line (same name on both) --------------------
		pref_shipping = _safe_get(source, "custom_preferred_shipping_line")
		if pref_shipping:
			target.custom_preferred_shipping_line = pref_shipping

		# -- Industry segment (Opportunity may have this field) -------------
		industry_segment = _safe_get(source, "custom_industry_segment")
		if industry_segment and hasattr(target, "custom_industry_segment"):
			target.custom_industry_segment = industry_segment

	target_doc = get_mapped_doc(
		"Customer",
		source_name,
		{
			"Customer": {
				"doctype": "Opportunity",
				"field_map": {
					# Standard ERPNext fields
					"name": "party_name",
					"doctype": "opportunity_from",
					"customer_name": "customer_name",
					"customer_group": "customer_group",
					# Direct custom field matches (same fieldname on both doctypes)
					"custom_type_of_buyer": "custom_type_of_buyer",
					"custom_bill_to_party_country": "custom_bill_to_party_country",
					"custom_product_name": "custom_product_name",
					"custom_product_grade": "custom_product_grade",
				},
			}
		},
		target_doc,
		set_missing_values,
	)

	return target_doc
