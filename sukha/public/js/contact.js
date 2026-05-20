frappe.ui.form.on('Contact Phone', {
    custom_contact_number: function(frm, cdt, cdn) {
        let child = frappe.get_doc(cdt, cdn);
        
        if (child.custom_contact_number) {
            frm.set_value('phone', child.custom_contact_number);
            frappe.model.set_value(cdt, cdn, 'phone', child.custom_contact_number);
            frappe.model.set_value(cdt, cdn, 'is_primary_phone', 1);
        }
    }
});

frappe.ui.form.on('Contact', {
    before_save: function(frm) {
        if (frm.doc.phone_nos && frm.doc.phone_nos.length) {
            frm.doc.phone_nos.forEach(phone => {
                if (phone.custom_contact_number && phone.phone !== phone.custom_contact_number) {
                    frappe.model.set_value(phone.doctype, phone.name, 'phone', phone.custom_contact_number);
                }
            });
        }
    }
});