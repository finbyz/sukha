import frappe

def before_insert(self,method):
    if self.items and self.items[0].blanket_order:
        cs = frappe.get_doc("Blanket Order", self.items[0].blanket_order)
        self.selling_price_list = frappe.db.get_value("Quotation",cs.custom_quotation,"selling_price_list")
        self.price_list_currency = frappe.db.get_value("Quotation",cs.custom_quotation,"price_list_currency")
        self.plc_conversion_rate = frappe.db.get_value("Quotation",cs.custom_quotation,"plc_conversion_rate")

def validate(self, method):
    # Update Sales Order header fields from first item's Cost Sheet
    if self.items and self.items[0].custom_cost_sheet:
        cs = frappe.get_doc("Cost Sheet", self.items[0].custom_cost_sheet)
        
        field_map = {
            "custom_container_type": "container_type",
            "payment_terms_template": "customer_payment_terms",
            # "shipping_terms": "incoterm",
            "incoterm": "incoterm",
            "port_of_loading": "port_of_loading",
            "port_of_discharge": "port_of_discharge",
            "country_of_destination": "country_of_destination",
            "pre_carriage_by": "loading_location",
            "custom_std_pakcing": "custom_std_pakcing",
            "custom_number_of_containers":"total_fcl"
        }
        
        for so_field, cs_field in field_map.items():
            value = cs.get(cs_field)
            if value is not None:
                self.set(so_field, value)
    
    # Update item-level fields from each item's Cost Sheet
    for row in self.items:
        if row.custom_cost_sheet:
            doc = frappe.get_doc("Cost Sheet", row.custom_cost_sheet)
            row.custom_total_number_of_fcl = doc.total_fcl
            row.custom_standard_packing_size_kg = doc.packing_unit_size
            row.custom_qty_stuffed_in_one_fcl_kg = doc.total_quantity
            row.custom_total_quantity_kg = doc.total_quantity