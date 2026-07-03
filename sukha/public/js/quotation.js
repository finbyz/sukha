frappe.ui.form.on("Quotation", {
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
                                docstatus: 1,
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