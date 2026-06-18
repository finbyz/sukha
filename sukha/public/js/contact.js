frappe.ui.form.on('Contact Phone', {
    custom_contact_number: function(frm, cdt, cdn) {
        let child = frappe.get_doc(cdt, cdn);
        
        if (child.custom_contact_number) {
            let val = child.custom_contact_number.trim();
            if (!val.startsWith("+")) {
                let digits = val.replace(/\D/g, "");
                if (digits.length === 10) {
                    val = "+91" + digits;
                } else if (digits.length === 11 && digits.startsWith("0")) {
                    val = "+91" + digits.substring(1);
                } else if (digits.length === 12 && digits.startsWith("91")) {
                    val = "+" + digits;
                } else if (digits.length > 0) {
                    val = "+91" + digits;
                }
            }
            frappe.model.set_value(cdt, cdn, 'custom_contact_number', val);
            frappe.model.set_value(cdt, cdn, 'phone', val);
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