# Copyright (c) 2024, FinByz Tech Pvt Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc


@frappe.whitelist()
def make_opportunity(source_name, target_doc=None):
	"""
	Create Opportunity from Prospect with automatic opportunity_type setting
	
	Business Logic:
	- If Prospect has custom_type_of_buyer: Set opportunity_type = "Active Enquiry - Export"
	- If Prospect has custom_buyer_type:
	  * If "Domestic": Set opportunity_type = "Active Enquiry - Domestic"
	  * If "Merchant": Set opportunity_type = "Active Enquiry - Merchant"
	- Default: Set opportunity_type = "Active Enquiry"
	
	"""
	def set_missing_values(source, target):
		target.opportunity_from = "Prospect"
		target.customer_name = source.company_name
		target.customer_group = source.customer_group or frappe.db.get_default("Customer Group")

		# Opportunity Type Logic
		opportunity_type = "Active Enquiry"

		if source.get("custom_type_of_buyer"):
			opportunity_type = "Active Enquiry - Export"
		elif source.get("custom_buyer_type"):
			if source.custom_buyer_type == "Domestic":
				opportunity_type = "Active Enquiry - Domestic"
			elif source.custom_buyer_type == "Merchant":
				opportunity_type = "Active Enquiry - Merchant"

		target.opportunity_type = opportunity_type

		# -----------------------------------------
		# Auto Map All Matching Custom Fields
		# -----------------------------------------

		prospect_meta = frappe.get_meta("Prospect")
		opportunity_meta = frappe.get_meta("Opportunity")

		opportunity_fields = {
			f.fieldname for f in opportunity_meta.fields
		}

		for field in prospect_meta.fields:

			if not field.fieldname.startswith("custom_"):
				continue

			if field.fieldtype in (
				"Section Break",
				"Column Break",
				"Tab Break",
				"Table",
			):
				continue

			if field.fieldname not in opportunity_fields:
				continue

			value = source.get(field.fieldname)

			if value in (None, "", []):
				continue

			target.set(field.fieldname, value)
		# -----------------------------------------
		# Explicit Different Name Mapping
		# -----------------------------------------

		field_map = {
			"custom_current_supplier": "custom_preferred_supplier",
			"custom_approved_incoterms": "custom_incoterm",
			"custom_approved_payment_terms": "custom_customer_desired_payment_terms",
			"custom_prroduct_p": "custom_item_name",
			"custom_bill_to_party_name": "customer_name",
			"custom_contact_person_for_active_inquery": "custom_contact_person",
			"custom_contact_person_email_id": "custom_contact_person_email_id",
			"custom_contact_number": "custom_contact_number",
			"custom_industry_segment": "custom_industry_segment",
			"custom_preferred_communication": "custom_preferred_communication",
		}

		for source_field, target_field in field_map.items():
			val = source.get(source_field)
			if val not in (None, "", []):
				target.set(target_field, val)

		# Robust fallbacks for special mappings
		if source.get("custom_prroduct_p") and not target.get("custom_product_name"):
			target.set("custom_product_name", source.custom_prroduct_p)
			
		if source.get("custom_remarks") and not target.get("custom_remark"):
			target.set("custom_remark", source.custom_remarks)

		if source.get("custom_contact_person_email_id") and hasattr(target, "contact_email"):
			target.set("contact_email", source.custom_contact_person_email_id)

		if source.get("custom_contact_number") and hasattr(target, "contact_mobile"):
			target.set("contact_mobile", source.custom_contact_number)

		if source.get("custom_industry_segment") and hasattr(target, "industry"):
			target.set("industry", source.custom_industry_segment)

	doclist = get_mapped_doc(
		"Prospect",
		source_name,
		{
			"Prospect": {
				"doctype": "Opportunity",
				"field_map": {"name": "party_name", "prospect_owner": "opportunity_owner"},
			}
		},
		target_doc,
		set_missing_values,
		ignore_permissions=False,
	)

	return doclist


@frappe.whitelist()
def make_customer(source_name, target_doc=None):
	"""
	Enhanced customer creation from Prospect with comprehensive custom field mapping
	
	Business Logic:
	- If Prospect has custom_buyer_type (Domestic/Merchant):
	  * Set custom_customer_profile_type = "Domestic / Merchant"
	  * Set custom_specific_customer_category = value from custom_buyer_type
	  
	- If Prospect has custom_type_of_buyer (Export):
	  * Set custom_customer_profile_type = "Export"
	  * Set custom_type_of_buyer = value from custom_type_of_buyer
	  
	- Maps ALL custom fields from Prospect to Customer where field names match
	- Logs fields that exist in Prospect but not in Customer for reference
	"""
	def set_missing_values(source, target):
		target.customer_type = "Company"
		target.company_name = source.name
		target.customer_group = source.customer_group or frappe.db.get_default("Customer Group")
		
		# Enhanced logic for custom fields based on buyer_type and type_of_buyer
		if hasattr(source, 'custom_buyer_type') and source.custom_buyer_type:
			# If prospect has buyer_type (Domestic or Merchant)
			# Set custom_customer_profile_type to "Domestic / Merchant"
			if hasattr(target, 'custom_customer_profile_type'):
				target.custom_customer_profile_type = "Domestic / Merchant"
			
			# Set custom_specific_customer_category to the actual buyer_type value
			if hasattr(target, 'custom_specific_customer_category'):
				target.custom_specific_customer_category = source.custom_buyer_type
		
		elif hasattr(source, 'custom_type_of_buyer') and source.custom_type_of_buyer:
			# If prospect has type_of_buyer (Export)
			# Set custom_customer_profile_type to "Export"
			if hasattr(target, 'custom_customer_profile_type'):
				target.custom_customer_profile_type = "Export"
			
			# Set custom_type_of_buyer to the actual type_of_buyer value
			if hasattr(target, 'custom_type_of_buyer'):
				target.custom_type_of_buyer = source.custom_type_of_buyer
		
		# Comprehensive field mapping - maps all matching custom fields
		# Get all custom fields from source (Prospect)
		source_meta = frappe.get_meta('Prospect')
		target_meta = frappe.get_meta('Customer')
		
		# Get target field names for quick lookup
		target_fieldnames = {f.fieldname for f in target_meta.fields}
		
		# Track fields that don't exist in Customer
		missing_fields = []
		mapped_fields = []
		
		# Iterate through all custom fields in Prospect
		for field in source_meta.fields:
			if not field.fieldname.startswith('custom_'):
				continue
			
			# Skip section breaks, column breaks, tab breaks
			if field.fieldtype in ['Section Break', 'Column Break', 'Tab Break']:
				continue
			
			source_value = getattr(source, field.fieldname, None)
			
			# Skip empty values
			if source_value in (None, '', [], 0):
				continue
			
			# Check if field exists in Customer
			if field.fieldname in target_fieldnames:
				# Field exists in both - map it
				if hasattr(target, field.fieldname):
					try:
						setattr(target, field.fieldname, source_value)
						mapped_fields.append(field.fieldname)
					except Exception as e:
						frappe.log_error(f"Error mapping {field.fieldname}: {str(e)}", "Prospect to Customer Mapping")
			else:
				# Field doesn't exist in Customer
				missing_fields.append({
					'fieldname': field.fieldname,
					'fieldtype': field.fieldtype,
					'label': field.label,
					'value': str(source_value)[:50] if source_value else ''
				})
		
		# Log missing fields for reference
		if missing_fields:			
			# Also log to error log for admin reference
			frappe.log_error(
				f"Prospect: {source.name}\n\nMissing Fields in Customer:\n" +
				"\n".join([f"{f['fieldname']} ({f['fieldtype']}) - {f['label']}: {f['value']}" for f in missing_fields]),
				"Prospect to Customer - Missing Fields"
			)

	doclist = get_mapped_doc(
		"Prospect",
		source_name,
		{
			"Prospect": {
				"doctype": "Customer",
				"field_map": {
					"company_name": "customer_name",
					"currency": "default_currency",
					"fax": "fax",
					"territory": "territory",
					"customer_group": "customer_group",
					"website": "website",
				}
			}
		},
		target_doc,
		set_missing_values,
		ignore_permissions=False,
	)

	return doclist