import json
import frappe
from frappe import _
from frappe.utils import flt, getdate
from frappe.model.mapper import get_mapped_doc
from erpnext.stock.get_item_details import get_item_defaults
from erpnext.setup.utils import get_exchange_rate
from erpnext.manufacturing.doctype.blanket_order.blanket_order import BlanketOrder


@frappe.whitelist()
def make_order(source_name, target_doctype=None, selected_items=None, country=None):
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
		if not target_doc.payment_terms_template:
			target_doc.payment_terms_template = source_doc.payment_terms_template
		# Copy currency and conversion rate to target document
		if hasattr(source_doc, "currency"):
			target_doc.currency = source_doc.currency
		if hasattr(source_doc, "conversion_rate"):
			target_doc.conversion_rate = source_doc.conversion_rate

	def update_item(source, target, source_parent):
		target_qty = source.get("qty") - source.get("ordered_qty")
		target.qty = target_qty if flt(target_qty) >= 0 else 0
		target.rate = source.get("rate")
		target.blanket_order_rate = source.get("rate")
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

	def update_item_payment_schedule(source_item, target_item, source_parent):
		target_item.due_date = source_item.due_date
		target_item.invoice_portion = source_item.invoice_portion
		target_item.due_date_based_on = source_item.due_date_based_on
		target_item.payment_amount = source_item.payment_amount
		target_item.description = source_item.description

	target_doc = get_mapped_doc(
		"Blanket Order",
		source_name,
		{
			"Blanket Order": {"doctype": doctype, "postprocess": update_doc},
			"Blanket Order Item": {
				"doctype": doctype + " Item",
				"field_map": {"rate": "blanket_order_rate", "parent": "blanket_order", "base_rate": "base_rate", "custom_cost_sheet": "custom_cost_sheet"},
				"postprocess": update_item,
				"condition": item_condition,
			},
			"Payment Schedule": {
				"doctype": "Payment Schedule",
				"field_no_map": ["name"],
				"postprocess": update_item_payment_schedule,
			}
		},
	)

	if target_doc.doctype == "Purchase Order":
		target_doc.set_missing_values()

	return target_doc


class CustomBlanketOrder(BlanketOrder):
	"""Extended Blanket Order with currency handling similar to Quotation"""
	
	def validate(self):
		# Call parent validate
		super().validate()
		# Add currency-specific validation
		self.set_price_list_and_exchange_rate()
		self.check_conversion_rate()
		self.calculate_base_rate()

	def set_price_list_and_exchange_rate(self):
		"""Set currency and conversion rate similar to Quotation"""
		if self.blanket_order_type == "Selling" and self.customer:
			# Get customer default currency
			customer_currency = frappe.db.get_value("Customer", self.customer, "default_currency")
			if customer_currency:
				self.currency = customer_currency
		elif self.blanket_order_type == "Purchasing" and self.supplier:
			# Get supplier default currency
			supplier_currency = frappe.db.get_value("Supplier", self.supplier, "default_currency")
			if supplier_currency:
				self.currency = supplier_currency

		# If currency not set, use company currency
		if not self.currency:
			self.currency = frappe.db.get_value("Company", self.company, "default_currency")

		# Get transaction date
		transaction_date = self.transaction_date if hasattr(self, "transaction_date") and self.transaction_date else self.from_date

		# Set conversion rate if not already set
		if self.currency and not self.conversion_rate:
			if self.currency == frappe.db.get_value("Company", self.company, "default_currency"):
				self.conversion_rate = 1.0
			else:
				self.conversion_rate = get_exchange_rate(
					self.currency,
					frappe.db.get_value("Company", self.company, "default_currency"),
					transaction_date,
					"for_selling" if self.blanket_order_type == "Selling" else "for_buying"
				)

	def check_conversion_rate(self):
		"""Validate conversion rate similar to AccountsController"""
		if not self.conversion_rate:
			frappe.throw(_("Conversion rate cannot be 0"))

		company_currency = frappe.db.get_value("Company", self.company, "default_currency")
		if self.currency == company_currency and flt(self.conversion_rate) != 1.00:
			frappe.throw(_("Conversion rate must be 1.00 if document currency is same as company currency"))

		if self.currency != company_currency and flt(self.conversion_rate) == 1.00:
			frappe.msgprint(
				_("Conversion rate is 1.00, but document currency is different from company currency")
			)

	def calculate_base_rate(self):
		"""Calculate base rate (company currency) for items"""
		company_currency = frappe.db.get_value("Company", self.company, "default_currency")
		for item in self.items:
			if item.rate and self.conversion_rate:
				item.base_rate = flt(item.rate * self.conversion_rate)
			elif self.currency == company_currency:
				item.base_rate = item.rate
			else:
				item.base_rate = 0
