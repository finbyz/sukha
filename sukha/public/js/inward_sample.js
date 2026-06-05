frappe.ui.form.on("Inward Sample", {
    setup(frm) {
        frm.set_query("custom_batch_no_", function () {
            return {
                filters: {
                    item: frm.doc.item_code,
                    disabled: 0
                }
            };
        });
    },

    refresh(frm) {

        if (!frm.doc.currency) {
            frm.set_value("currency", frappe.boot.sysdefaults.currency);
        }

        calculate_total_evaluation_cost(frm);
    },

    custom_sample_cost(frm) {
        calculate_total_evaluation_cost(frm);
    },

    custom_courier_cost(frm) {
        calculate_total_evaluation_cost(frm);
    },

    custom_testing_cost(frm) {
        calculate_total_evaluation_cost(frm);
    },

    async item_code(frm) {

        frm.set_value("custom_un_no", "");
        frm.set_value("custom_batch_no_", "");
        frm.set_value("custom_manufacturing_date", "");

        if (!frm.doc.item_code) return;

        // Fetch UN No from Item Compliance child table
        let item = await frappe.db.get_doc("Item", frm.doc.item_code);

        if (item.custom_item_compliance_and_export?.length) {
            frm.set_value(
                "custom_un_no",
                item.custom_item_compliance_and_export[0].un_number || ""
            );
        }
    },

    custom_batch_no(frm) {

        if (!frm.doc.custom_batch_no) {
            frm.set_value("custom_manufacturing_date", "");
            return;
        }

        // Fetch Manufacturing Date from selected Batch
        frappe.db.get_value(
            "Batch",
            frm.doc.custom_batch_no,
            "manufacturing_date"
        ).then(r => {

            if (r.message) {
                frm.set_value(
                    "custom_manufacturing_date",
                    r.message.manufacturing_date
                );
            }
        });
    }
});

function calculate_total_evaluation_cost(frm) {

    const total =
        flt(frm.doc.custom_sample_cost) +
        flt(frm.doc.custom_courier_cost) +
        flt(frm.doc.custom_testing_cost);

    frm.set_value(
        "custom_total_evaluation_cost",
        total
    );
}

frappe.ui.form.on("Inward Sample", {

    async party(frm) {

        if (frm.doc.link_to !== "Supplier" || !frm.doc.party) {
            return;
        }

        try {

            // Supplier Details
            let supplier = await frappe.db.get_doc(
                "Supplier",
                frm.doc.party
            );

            frm.set_value(
                "custom_supplier_name_",
                supplier.supplier_name || ""
            );

            frm.set_value(
                "custom_supplier_type",
                supplier.supplier_type || ""
            );

            // Primary Contact
            if (supplier.supplier_primary_contact) {

                let contact = await frappe.db.get_doc(
                    "Contact",
                    supplier.supplier_primary_contact
                );

                frm.set_value(
                    "custom_contact_person",
                    contact.first_name || contact.full_name || ""
                );

                frm.set_value(
                    "custom_email_id",
                    contact.email_id || ""
                );

                console.log("Contact:", contact);
                console.log("phone:", contact.phone);
                console.log("mobile_no:", contact.mobile_no);
                console.log("phone_nos:", contact.phone_nos);

                let mobile =
                    contact.phone ||
                    contact.mobile_no ||
                    (contact.phone_nos?.length
                        ? contact.phone_nos[0].phone
                        : "");

                console.log("Final Mobile:", mobile);

                await frm.set_value(
                    "custom_mobilewhatsapp",
                    mobile
                );

                frm.refresh_field("custom_mobilewhatsapp");
            }

            // Primary Address
            if (supplier.supplier_primary_address) {

                let address = await frappe.db.get_doc(
                    "Address",
                    supplier.supplier_primary_address
                );

                frm.set_value(
                    "custom_country",
                    address.country || ""
                );

                frm.set_value(
                    "custom_state",
                    address.state || ""
                );

                frm.set_value(
                    "custom_city",
                    address.city || ""
                );
            }

        } catch (e) {
            console.error(e);
        }
    }
});