# Copyright (c) 2024, FinByz Tech Pvt Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.mapper import get_mapped_doc


@frappe.whitelist()
def make_opportunity(source_name, target_doc=None):
	"""
	Create Opportunity from Customer with automatic opportunity_type setting
	
	Business Logic:
	- If Customer has custom_type_of_buyer: Set opportunity_type = "Repeated Enquiry - Export"
	- If Customer has custom_specific_customer_category:
	  * If "Domestic": Set opportunity_type = "Repeated Enquiry - Domestic"
	  * If "Merchant": Set opportunity_type = "Repeated Enquiry - Merchant"
	- Default: Set opportunity_type = "Repeated Enquiry"
	"""
	def set_missing_values(source, target):
		target.opportunity_from = "Customer"
		target.party_name = source.name
		target.customer_name = source.customer_name
		target.customer_group = source.customer_group
		
		# Set opportunity_type based on customer type
		opportunity_type = "Repeated Enquiry"
		
		if hasattr(source, 'custom_type_of_buyer') and source.custom_type_of_buyer:
			# Export customer
			opportunity_type = "Repeated Enquiry - Export"
		elif hasattr(source, 'custom_specific_customer_category') and source.custom_specific_customer_category:
			# Domestic or Merchant customer
			if source.custom_specific_customer_category == "Domestic":
				opportunity_type = "Repeated Enquiry - Domestic"
			elif source.custom_specific_customer_category == "Merchant":
				opportunity_type = "Repeated Enquiry - Merchant"
		
		if hasattr(target, 'opportunity_type'):
			target.opportunity_type = opportunity_type
		
		# Copy buyer type fields to opportunity
		if hasattr(source, 'custom_type_of_buyer') and hasattr(target, 'custom_type_of_buyer'):
			target.custom_type_of_buyer = source.custom_type_of_buyer
		
		if hasattr(source, 'custom_specific_customer_category') and hasattr(target, 'custom_buyer_type'):
			target.custom_buyer_type = source.custom_specific_customer_category

	target_doc = get_mapped_doc(
		"Customer",
		source_name,
		{
			"Customer": {
				"doctype": "Opportunity",
				"field_map": {
					"name": "party_name",
					"doctype": "opportunity_from",
				},
			}
		},
		target_doc,
		set_missing_values,
	)

	return target_doc
