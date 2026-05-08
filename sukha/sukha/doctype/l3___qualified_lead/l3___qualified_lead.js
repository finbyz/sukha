frappe.ui.form.on('L3 - Qualified Lead', {

    refresh: function(frm) {
        // On load: restore section visibility based on saved flag
        if (frm.doc.show_accounts_section) {
            frm.set_df_property('account_section', 'hidden', 0);
            frm.set_df_property('credit_approvals_checklist_section', 'hidden', 0);
            set_payment_section_readonly(frm, true);
        } else {
            frm.set_df_property('account_section', 'hidden', 1);
            frm.set_df_property('credit_approvals_checklist_section', 'hidden', 1);
            set_payment_section_readonly(frm, false);
        }

        frm.refresh_fields();
        render_edit_button(frm);
        wire_approval_button(frm);
    },

        // contact: function(frm) {
        //     if (frm.doc.contact) {
        //         frappe.db.get_doc('Contact', frm.doc.contact)
        //             .then(doc => {

        //                 let content = `
        //     <b>${doc.first_name || ''}</b><br>
        //     📞 Phone: ${doc.phone || ''}<br>
        //     📱 Mobile: ${doc.mobile_no || ''}<br>
        // ✉️ Email: ${doc.email_id || ''}
        //                         `;

        //                         frm.set_value('primary_contact', content);
        //                     });
        //             }
        // },

    approval_button: function(frm) {
        wire_approval_button(frm);
    }
});


function wire_approval_button(frm) {
    if (!frm.fields_dict.approval_button || !frm.fields_dict.approval_button.$input) return;

    frm.fields_dict.approval_button.$input
        .off("click.custom")
        .on("click.custom", function () {
            // Show both sections
            frm.set_value('show_accounts_section', 1);
            frm.set_df_property('account_section', 'hidden', 0);
            frm.set_df_property('credit_approvals_checklist_section', 'hidden', 0);

            // Make Customer Payment Terms section read only
            set_payment_section_readonly(frm, true);

            frm.refresh_fields();
            render_edit_button(frm);
            scroll_to_field('account_section');
        });
}


// Fields inside Customer Payment Terms section
const PAYMENT_SECTION_FIELDS = [
    'approved_payment_terms',
    'document_submitted',
    'attach_wisj',
    'credit_limit',
    'attach',
    'attach_fiqt'
];


function set_payment_section_readonly(frm, is_readonly) {
    PAYMENT_SECTION_FIELDS.forEach(fieldname => {
        if (frm.fields_dict[fieldname]) {
            frm.set_df_property(fieldname, 'read_only', is_readonly ? 1 : 0);
        }
    });
}


function render_edit_button(frm) {
    if (!frm.fields_dict.edit_request_html) return;

    if (!frm.doc.show_accounts_section) {
        frm.fields_dict.edit_request_html.$wrapper.html('');
        return;
    }

    let html = `
        <div style="text-align:right; padding: 4px 8px;">
            <a href="#" id="edit_request_btn" style="color:#5e64ff; font-weight:500; font-size:13px;">
                ✏️ Edit Request
            </a>
        </div>
    `;

    frm.fields_dict.edit_request_html.$wrapper.html(html);

    frm.fields_dict.edit_request_html.$wrapper
        .find("#edit_request_btn")
        .off("click")
        .on("click", function(e) {
            e.preventDefault();

            // Hide both sections
            frm.set_value('show_accounts_section', 0);
            frm.set_df_property('account_section', 'hidden', 1);
            frm.set_df_property('credit_approvals_checklist_section', 'hidden', 1);

            // Remove read only from Customer Payment Terms
            set_payment_section_readonly(frm, false);

            frm.refresh_fields();
            frm.fields_dict.edit_request_html.$wrapper.html('');
            scroll_to_field('customer_payment_terms_section');
        });
}


function scroll_to_field(fieldname) {
    setTimeout(() => {
        let el = document.querySelector(`[data-fieldname="${fieldname}"]`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, 350);
}