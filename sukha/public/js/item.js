frappe.ui.form.on("Item", {
    refresh(frm) {

        frm.fields_dict.custom_item_compliance_and_export.grid
            .get_field("sub_category_name")
            .get_query = function(doc, cdt, cdn) {

                let row = locals[cdt][cdn];

                return {
                    filters: {
                        parent_category: row.hazar_based
                    }
                };
            };
    }
});

frappe.ui.form.on("Item Compliance and Export", {
    hazar_based(frm, cdt, cdn) {
        frappe.model.set_value(cdt, cdn, "sub_category_name", "");
    }
});