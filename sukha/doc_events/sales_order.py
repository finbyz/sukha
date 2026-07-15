import frappe

def validate(self,method):
    for row in self.items:
        if row.custom_cost_sheet:
            doc = frappe.get_doc("Cost Sheet",row.custom_cost_sheet)
            row.custom_total_number_of_fcl = doc.total_fcl
            row.custom_standard_packing_size_kg = doc.packing_unit_size
            row.custom_qty_stuffed_in_one_fcl_kg = doc.total_quantity
            row.custom_total_quantity_kg = doc.total_quantity
            