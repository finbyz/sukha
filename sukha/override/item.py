import frappe
from erpnext.stock.doctype.item.item import Item as _Item
from erpnext.controllers.item_variant import (
	make_variant_item_code,
)	
from frappe.utils import strip
from frappe.model.naming import make_autoname
class Item(_Item):
	def autoname(self):
		if frappe.db.get_default("item_naming_by") == "Naming Series":
			if self.variant_of:
				if not self.item_code:
					template_item_name = frappe.db.get_value("Item", self.variant_of, "item_name")
					make_variant_item_code(self.variant_of, template_item_name, self)

		else:
				# frappe.throw(str(self.naming_series))
				item_group_prefix = (self.item_group or "")[:4].upper()

				self.name = make_autoname(
					f"{item_group_prefix}-{self.gst_hsn_code}-.#####",
					doc=self
				)
				# self.item_code = self.name

		self.item_code = strip(self.item_code)
