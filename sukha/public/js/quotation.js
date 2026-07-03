frappe.ui.form.on("Quotation", {
    refresh(frm) {
        frm.add_custom_button(__("Cost Sheet"), () => {
            erpnext.utils.map_current_doc({
                method: "sukha.doc_events.quotation.make_quotation",
                source_doctype: "Cost Sheet",
                target: frm,
                setters: {
                    customer: undefined,
                    company: frm.doc.company
                },
                get_query_filters: {
                    docstatus: 0
                }
            });
        }, __("Get Items From"));
    }   
});