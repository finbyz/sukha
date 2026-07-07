// Copyright (c) 2026, kaustubh and contributors
// For license information, please see license.txt

frappe.query_reports["Prospect vs Last Inquiry"] = {
	filters: [
		{
			"fieldname": "product",
			"label": __("Product"),
			"fieldtype": "Link",
			"options": "Item"
		},
		{
			"fieldname": "product_owner",
			"label": __("Product Owner"),
			"fieldtype": "Link",
			"options": "User"
		},
		{
			"fieldname": "type",
			"label": __("Type"),
			"fieldtype": "Select",
			"options": "\nDomestic\nExport\nMerchant"
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date"
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date"
		}
	]
};
