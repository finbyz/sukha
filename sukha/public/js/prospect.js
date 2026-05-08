frappe.ui.form.on('Prospect', {
    before_workflow_action: function(frm) {
        if (!frm.selected_workflow_action || !/reject/i.test(frm.selected_workflow_action)) {
            return;
        }

        let remark_fields = [];

        if (frm.doc.custom_advance) {
            remark_fields.push("custom_accounts_remark");
        }

        if (frm.doc.custom_lc) {
            remark_fields.push("custom_remarks");
        }

        if (!remark_fields.length) {
            return;
        }

        frappe.dom.unfreeze();

        return new Promise((resolve, reject) => {
            const dialog = new frappe.ui.Dialog({
                title: __("Rejection Reason"),
                fields: [
                    {
                        label: __("Reason"),
                        fieldname: "rejection_reason",
                        fieldtype: "Small Text",
                        reqd: 1
                    }
                ],
                primary_action_label: __("Reject"),
                primary_action: function(values) {
                    const reason = (values.rejection_reason || "").trim();

                    if (!reason) {
                        frappe.msgprint({
                            title: __("Validation"),
                            message: __("Please enter rejection reason"),
                            indicator: "red"
                        });
                        return;
                    }

                    Promise.all(remark_fields.map((fieldname) => frm.set_value(fieldname, reason)))
                        .then(() => frm.save())
                        .then(() => {
                            dialog.hide();
                            frappe.dom.freeze();
                            resolve();
                        })
                        .catch((error) => {
                            frappe.dom.unfreeze();
                            reject(error);
                        });
                },
                secondary_action_label: __("Cancel"),
                secondary_action: function() {
                    dialog.hide();
                    frm.selected_workflow_action = null;
                    frappe.dom.unfreeze();
                    reject();
                }
            });

            dialog.show();
        });
    },
    custom_industry_segment(frm)
    {
        frm.set_value("industry", frm.doc.custom_industry_segment);
    },
    custom_product: function(frm) {
        frm.set_value("custom_prroduct_p", frm.doc.custom_product);
    },
    refresh: function(frm) {
        // Add custom buttons to view linked leads and opportunities
        if (!frm.is_new()) {
            // Show linked leads count
            if (frm.doc.leads && frm.doc.leads.length > 0) {
                frm.add_custom_button(__('View Leads ({0})', [frm.doc.leads.length]), function() {
                    frappe.route_options = {
                        "name": ["in", frm.doc.leads.map(l => l.lead)]
                    };
                    frappe.set_route("List", "Lead");
                }, __('View'));
            }
            
            // Show linked opportunities count
            if (frm.doc.opportunities && frm.doc.opportunities.length > 0) {
                frm.add_custom_button(__('View Opportunities ({0})', [frm.doc.opportunities.length]), function() {
                    frappe.route_options = {
                        "name": ["in", frm.doc.opportunities.map(o => o.opportunity)]
                    };
                    frappe.set_route("List", "Opportunity");
                }, __('View'));
            }
        }
    },
    
    onload: function(frm) {
        // Auto-populate fields from Lead when creating new Prospect
        if (frm.is_new() && frm.doc.leads && frm.doc.leads.length > 0) {
            let lead_name = frm.doc.leads[0].lead;

            if (lead_name) {
                frappe.call({
                    method: "frappe.client.get",
                    args: {
                        doctype: "Lead",
                        name: lead_name
                    },
                    callback: function(r) {
                        if (r.message) {
                            let lead = r.message;

                            // Map custom fields from Lead to Prospect
                            if (lead.custom_contact_person) {
                                frm.set_value("custom_contact_person", lead.custom_contact_person);
                            }
                            if (lead.custom_contact_person_email_id) {
                                frm.set_value("custom_contact_person_email_id", lead.custom_contact_person_email_id);
                            }
                            if (lead.custom_contact_person_whatsapp_number) {
                                frm.set_value("custom_contact_person_whatsapp_number", lead.custom_contact_person_whatsapp_number);
                            }
                            if (lead.custom_country_of_destination) {
                                frm.set_value("custom_country_of_destination", lead.custom_country_of_destination);
                            }
                            if (lead.custom_port_of_destination) {
                                frm.set_value("custom_port_of_destination", lead.custom_port_of_destination);
                            }
                            if (lead.custom_product_name) {
                                frm.set_value("custom_product", lead.custom_product_name);
                            }
                            if (lead.custom_sales_type) {
                                frm.set_value("custom_sales_type", lead.custom_sales_type);
                            }
                            if (lead.custom_volume_range) {
                                frm.set_value("custom_volume_range", lead.custom_volume_range);
                            }
                            if (lead.custom_source_of_the_lead) {
                                frm.set_value("custom_source_of_the_lead", lead.custom_source_of_the_lead);
                            }
                        }
                    }
                });
            }
        }
    }
});
