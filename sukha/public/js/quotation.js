frappe.ui.form.on("Quotation", {
    onload(frm) {
        // Disable standard lost dialog and register our custom one locally
        frappe.ui.form.off("Quotation", "set_as_lost_dialog");
        frappe.ui.form.on("Quotation", "set_as_lost_dialog", function (frm) {
            show_custom_lost_dialog(frm);
        });
    },

    refresh(frm) {
        setTimeout(() => {
        frm.page.remove_inner_button(__("Sales Order"), __("Create"));
    }, 300);
        if (frm.doc.docstatus == 0) {
            frm.add_custom_button(__("Cost Sheet"), () => {
                frappe.call({
                    method: "sukha.doc_events.quotation.get_used_cost_sheets",
                    callback: function (r) {
                        let used_cost_sheets = (r.message && r.message.length)
                            ? r.message
                            : ["__none__"];

                        erpnext.utils.map_current_doc({
                            method: "sukha.doc_events.quotation.make_quotation",
                            source_doctype: "Cost Sheet",
                            target: frm,
                            setters: {
                                customer: undefined,
                                company: frm.doc.company
                            },
                            get_query_filters: {
                                docstatus: ["!=", 2],
                                name: ["not in", used_cost_sheets]
                            }
                        });
                    }
                });
            }, __("Get Items From"));
        }

        // Buttons for Submitted Documents
        if (frm.doc.docstatus === 1) {
            
            // 1. Button to Create Customer (Only show if customer is missing)
            if (frm.doc.quotation_to !=="Customer" && !frm.doc.custom_new_customer) {
                frm.add_custom_button(__("Customer"), () => {
                    show_customer_creation_dialog(frm);
                }, __("Create"));
            }

            // 2. Button to Create Blanket Order
            frm.add_custom_button(__("Blanket Order"), () => {
                if (!frm.doc.party_name && !frm.doc.custom_new_customer) {
                    frappe.msgprint({
                        title: __("Missing Customer"),
                        message: __("Please create a Customer first using the 'Customer' button."),
                        indicator: "orange"
                    });
                    return;
                }
                
                frappe.model.open_mapped_doc({
                    method: "sukha.doc_events.quotation.make_blanket_order",
                    frm: frm,
                });
            }, __("Create"));
        }
    }
});


function show_customer_creation_dialog(frm) {
    let dialog = new frappe.ui.Dialog({
        title: __("Create Customer"),
        fields: [
            {
                fieldtype: "Select",
                label: __("Customer Profile Type"),
                fieldname: "custom_customer_profile_type",
                reqd: 1,
                options: "\nExport\nDomestic / Merchant"
            },
            {
                fieldtype: "Select",
                label: __("Customer Type"),
                fieldname: "custom_customer_type",
                options: "\nCompany\nIndividual\nPartnership",
                default: "Company",
                reqd: 1
            },
            {
                fieldtype: "Data",
                label: __("Customer Name"),
                fieldname: "customer_name",
                reqd: 1
            },
            {
                fieldtype: "Select",
                label: __("Type of Buyer"),
                fieldname: "custom_type_of_buyer",
                options: "\nStockiest/Distributer\nEnd User\nTrader\nAgent",
                reqd: 1
            },
            {
                fieldtype: "Select",
                label: __("Buying Type"),
                fieldname: "custom_buying_type",
                options: "\nSpot\nContractual",
                reqd: 1
            },
            {
                fieldtype: "Select",
                label: __("GST Category"),
                fieldname: "gst_category",
                options: "\nRegistered Regular\nRegistered Composition\nUnregistered\nSEZ\nOverseas\nDeemed Export\nUIN Holders\nTax Deductor\nTax Collector\nInput Service Distributor",
                reqd: 1
            },
        ],

        primary_action_label: __("Create Customer"),

        primary_action() {
            let values = dialog.get_values();
            if (!values) return;

            dialog.get_primary_btn().prop("disabled", true);
            dialog.get_primary_btn().text(__("Creating..."));

            frappe.call({
                method: "frappe.client.insert",
                args: {
                    doc: {
                        doctype: "Customer",
                        customer_profile_type: values.custom_customer_profile_type,
                        custom_customer_type: values.custom_customer_type,
                        customer_name: values.customer_name,
                        gst_category: values.gst_category,
                        custom_type_of_buyer: values.custom_type_of_buyer,
                        custom_buying_type: values.custom_buying_type
                    }
                },
                callback(r) {
                    if (!r.exc && r.message) {

                        frappe.call({
                            method: "frappe.client.set_value",
                            args: {
                                doctype: "Quotation",
                                name: frm.doc.name,
                                fieldname: "custom_new_customer",
                                value: r.message.name
                            },
                            callback() {

                                frm.reload_doc().then(() => {

                                    dialog.hide();

                                    frappe.show_alert({
                                        message: __("Customer Created Successfully"),
                                        indicator: "green"
                                    });

                                    frappe.model.open_mapped_doc({
                                        method: "sukha.doc_events.quotation.make_blanket_order",
                                        frm: frm
                                    });

                                });

                            }
                        });

                    } else {
                        dialog.get_primary_btn().prop("disabled", false);
                        dialog.get_primary_btn().text(__("Create Customer"));
                    }
                },
                error() {
                    dialog.get_primary_btn().prop("disabled", false);
                    dialog.get_primary_btn().text(__("Create Customer"));

                    frappe.msgprint(__("Unable to create Customer."));
                }
            });
        }
    });

    dialog.show();
}


function show_custom_lost_dialog(frm) {
    let child_doctype =
        frm.doctype === "Opportunity"
            ? "Opportunity Lost Reason Detail"
            : "Quotation Lost Reason Detail";

    let dialog = new frappe.ui.Dialog({
        title: __("Set as Lost"),
        fields: [
            {
                fieldtype: "Link",
                label: __("Primary Category"),
                fieldname: "primary_category",
                options: "Primary Category",
                reqd: 1,
                change: function () {
                    dialog.set_value("lost_reason", []);
                },
            },
            {
                fieldtype: "Table MultiSelect",
                label: __("Lost Reasons"),
                fieldname: "lost_reason",
                options: child_doctype,
                reqd: 1,
                depends_on: "eval:doc.primary_category",
            },
            {
                fieldtype: "Table MultiSelect",
                label: __("Competitors"),
                fieldname: "competitors",
                options: "Competitor Detail",
            },
            {
                fieldtype: "Small Text",
                label: __("Detailed Reason"),
                fieldname: "detailed_reason",
            },
        ],
        primary_action: function () {
            let values = dialog.get_values();

            frm.call({
                doc: frm.doc,
                method: "declare_enquiry_lost",
                args: {
                    lost_reasons_list: values.lost_reason,
                    competitors: values.competitors ? values.competitors : [],
                    detailed_reason: values.detailed_reason,
                },
                callback: function (r) {
                    dialog.hide();
                    frm.reload_doc();
                },
            });
        },
        primary_action_label: __("Declare Lost"),
    });

    // Dynamic filter: Lost Reasons filtered by Primary Category
    dialog.set_query("lost_reason", function () {
        let primary_category = dialog.get_value("primary_category");
        return {
            query: "sukha.override.opportunity_override.get_filtered_lost_reasons",
            filters: {
                primary_category: primary_category || "",
                child_doctype: child_doctype,
            },
        };
    });

    dialog.show();
}