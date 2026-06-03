frappe.ui.form.on("Item", {
    setup(frm) {

        frm.fields_dict.custom_standard_packing.grid
            .get_field("packing_type")
            .get_query = function (doc, cdt, cdn) {

                let selected_packing_types = (frm.doc.custom_packing_type || [])
                    .map(row => row.packing_type)
                    .filter(Boolean);

                console.log("Selected Packing Types:", selected_packing_types);

                return {
                    filters: {
                        name: ["in", selected_packing_types]
                    }
                };
            };

        frm.set_query("custom_product_subcategory", function () {
            return {
                filters: {
                    item_group: frm.doc.item_group
                }
            };
        });
    },

    refresh(frm) {

        frm.fields_dict.custom_item_compliance_and_export.grid
            .get_field("sub_category_name")
            .get_query = function (doc, cdt, cdn) {

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