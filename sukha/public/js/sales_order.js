frappe.ui.form.on("Sales Order", {
    refresh: function(frm) {
        if (!frm.doc.customer) return;

        frappe.db.get_value(
            "Customer",
            frm.doc.customer,
            [
                "custom_customer_profile_type",
                "custom_specific_customer_category"
            ]
        ).then(r => {
            let profile_type = r.message.custom_customer_profile_type;
            let category = r.message.custom_specific_customer_category;

            console.log(profile_type);
            console.log(category);

            // Only apply logic when Profile Type is "Domestic / Merchant"
            if (profile_type === "Domestic / Merchant") {

                if (category === "Domestic") {
                    frm.set_df_property("custom_freight_charges", "hidden", 1);
                    frm.set_df_property("custom_container_requirement", "hidden", 1);
                    frm.set_df_property("custom_docuements", "hidden", 1);
                    frm.set_df_property("custom_section_break_4ukfq", "reqd", 1);

                }
                else if (category === "Merchant") {
                    frm.set_df_property("custom_freight_charges", "hidden", 1);
                    frm.set_df_property("custom_container_requirement", "hidden", 0);
                    frm.set_df_property("custom_docuements", "hidden", 1);
                    frm.set_df_property("custom_section_break_4ukfq", "reqd", 1);

                        
                }

            } else {
                // Export or any other profile type
                frm.set_df_property("custom_freight_charges", "hidden", 0);
                frm.set_df_property("custom_container_requirement", "hidden", 0);
                frm.set_df_property("custom_docuements", "hidden", 0);
                frm.set_df_property("custom_section_break_4ukfq", "reqd", 0);
            }

            frm.refresh_fields([
                "custom_freight_charges",
                "custom_container_requirement"
            ]);
        });
    }
});