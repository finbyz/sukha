frappe.ui.form.on("Quotation", {
    onload(frm) {
        // Disable standard lost dialog and register our custom one locally
        frappe.ui.form.off("Quotation", "set_as_lost_dialog");
        frappe.ui.form.on("Quotation", "set_as_lost_dialog", function (frm) {
            show_custom_lost_dialog(frm);
        });
    },

    refresh(frm) {
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

        if (frm.doc.docstatus === 0 || frm.doc.docstatus === 1) {
            frm.add_custom_button(__("Blanket Order"), () => {
                frappe.model.open_mapped_doc({
                    method: "sukha.doc_events.quotation.make_blanket_order",
                    frm: frm,
                });
            }, __("Create"));
        }
    }
});


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
                    competitors: values.competitors
                        ? values.competitors
                        : [],
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

    // ─── Dynamic filter: Lost Reasons filtered by Primary Category ───
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