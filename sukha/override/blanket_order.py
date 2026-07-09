import json
import frappe
from frappe.utils import flt
from frappe.model.mapper import get_mapped_doc
from erpnext.stock.get_item_details import get_item_defaults


@frappe.whitelist()
def make_order(source_name, target_doctype=None, selected_items=None):
	doctype = target_doctype
	if not doctype:
		doctype = frappe.flags.args.doctype if frappe.flags.args else None
	if not doctype:
		doctype = frappe.form_dict.get("doctype")
	if not doctype:
		frappe.throw("Target DocType is required")

	if selected_items and isinstance(selected_items, str):
		selected_items = json.loads(selected_items)
	selected_items = set(selected_items) if selected_items else None

	def update_doc(source_doc, target_doc, source_parent):
		if doctype == "Quotation":
			target_doc.quotation_to = "Customer"
			target_doc.party_name = source_doc.customer

	def update_item(source, target, source_parent):
		target_qty = source.get("qty") - source.get("ordered_qty")
		target.qty = target_qty if flt(target_qty) >= 0 else 0
		target.rate = source.get("rate")
		item = get_item_defaults(target.item_code, source_parent.company)
		if item:
			target.item_name = item.get("item_name")
			target.description = item.get("description")
			target.uom = item.get("stock_uom")
			target.against_blanket_order = 1
			target.blanket_order = source_name

	def item_condition(item):
		if selected_items is not None and item.name not in selected_items:
			return False
		return not (flt(item.qty)) or (flt(item.qty) - flt(item.ordered_qty)) > 0

	target_doc = get_mapped_doc(
		"Blanket Order",
		source_name,
		{
			"Blanket Order": {"doctype": doctype, "postprocess": update_doc},
			"Blanket Order Item": {
				"doctype": doctype + " Item",
				"field_map": {"rate": "blanket_order_rate", "parent": "blanket_order"},
				"postprocess": update_item,
				"condition": item_condition,
			},
		},
	)

	if target_doc.doctype == "Purchase Order":
		target_doc.set_missing_values()

	return target_doc