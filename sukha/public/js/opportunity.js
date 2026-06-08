frappe.ui.form.on('Opportunity', {

    onload: function (frm) {
        if (frm.doc.custom_posting_date === "now") {
            frm.set_value("custom_posting_date", frappe.datetime.get_today());
        }
    },

    refresh: function (frm) {
        contact_details(frm);
        frm.set_query("custom_pack_type", function () {

            return {
                filters: {
                    name: [
                        "in",
                        frm.packing_types?.length
                            ? frm.packing_types
                            : ["__NO_VALUE__"]
                    ]
                }
            };
        });

        // Existing document
        if (frm.doc.custom_product_name && !frm.packing_types) {

            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item",
                    name: frm.doc.custom_product_name
                },
                callback(r) {

                    if (r.message) {
                        frm.packing_types = (r.message.custom_packing_type || [])
                            .map(row => row.packing_type)
                            .filter(Boolean);
                    }
                }
            });
        }
        if (frm.is_new() && (!frm.doc.custom_posting_date || frm.doc.custom_posting_date === "now")) {
            frm.set_value("custom_posting_date", frappe.datetime.get_today());
        }

        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Cost Sheet'), function () {
                let url = '/cost_sheet';
                let params = new URLSearchParams();

                params.append('opportunity', frm.doc.name);
                if (frm.doc.opportunity_from) params.append('opportunity_from', frm.doc.opportunity_from);
                if (frm.doc.party_name) params.append('party_name', frm.doc.party_name);
                if (frm.doc.customer_name) params.append('customer_name', frm.doc.customer_name);
                if (frm.doc.custom_product_name) params.append('product_name', frm.doc.custom_product_name);
                if (frm.doc.custom_contact_person || frm.doc.contact_person) {
                    params.append('contact_person', frm.doc.custom_contact_person || frm.doc.contact_person);
                }
                if (frm.doc.custom_incoterm) params.append('incoterm', frm.doc.custom_incoterm);
                if (frm.doc.custom_preferred_supplier) params.append('supplier', frm.doc.custom_preferred_supplier);
                if (frm.doc.custom_preferred_shipping_line) params.append('shipping_line', frm.doc.custom_preferred_shipping_line);
                if (frm.doc.custom_container_type) params.append('container_type', frm.doc.custom_container_type);
                if (frm.doc.custom_pack_type || frm.doc.custom_packing_type) {
                    params.append('packing_type', frm.doc.custom_pack_type || frm.doc.custom_packing_type);
                }
                if (frm.doc.custom_unit_size_of_packing_kg) params.append('unit_size', frm.doc.custom_unit_size_of_packing_kg);
                if (frm.doc.custom_total_no_of_packing_units_in_a_container) params.append('units_per_fcl', frm.doc.custom_total_no_of_packing_units_in_a_container);
                if (frm.doc.custom_total_no_of_ccontainers) params.append('total_fcl', frm.doc.custom_total_no_of_ccontainers);
                if (frm.doc.custom_product_grade) params.append('product_grade', frm.doc.custom_product_grade);

                window.open(url + '?' + params.toString(), '_blank');
            }, __('Create'));
        }

        frm.page.remove_inner_button("Supplier Quotation", "Create");
        frm.page.remove_inner_button("Request For Quotation", "Create");
        frm.page.remove_inner_button("Customer", "Create");
        frm.page.remove_inner_button("Quotation", "Create");

        // hide Create group if empty
        setTimeout(() => {
            frm.page.wrapper
                .find('.custom-actions .btn-group')
            hide();
        }, 500);


    },
    custom_contact_person(frm) {
        contact_details(frm);

    },
    custom_product_name(frm) {

        if (!frm.doc.custom_product_name) return;

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Item",
                name: frm.doc.custom_product_name
            },
            callback(r) {

                if (!r.message) return;

                frm.packing_types = (r.message.custom_packing_type || [])
                    .map(row => row.packing_type)
                    .filter(Boolean);

                frm.set_value("custom_pack_type", "");
            }
        });
    },

    create_prospect_from_opportunity: async function (frm, prospect_type) {
        let lead = await frappe.db.get_doc("Lead", frm.doc.party_name);
        let d = new frappe.ui.Dialog({
            title: __('Create Prospect'),
            fields: [
                {
                    label: __('Prospect Name'),
                    fieldname: 'prospect_name',
                    fieldtype: 'Data',
                    default: lead.company_name || lead.lead_name,
                    reqd: 1,
                    description: __('Name of the company / prospect')
                },
            ],
            primary_action_label: __('Create Prospect'),
            primary_action: function (values) {
                if (!values.prospect_name) {
                    frappe.msgprint(__('Please enter a Prospect Name.'));
                    return;
                }

                frappe.call({
                    method: 'sukha.override.opportunity_override.create_prospect_from_opportunity',
                    args: {
                        opportunity_name: frm.doc.name,
                        lead_name: frm.doc.party_name,
                        prospect_name: values.prospect_name,
                        create_contact: values.create_contact ? 1 : 0,
                        prospect_type: prospect_type
                    },
                    freeze: true,
                    freeze_message: __('Creating Prospect...'),
                    callback: function (r) {
                        if (!r.exc && r.message) {
                            d.hide();
                            frappe.msgprint({
                                title: __('Success'),
                                message: __('Prospect <a href="/app/prospect/{0}">{0}</a> created successfully!',
                                    [r.message]),
                                indicator: 'green'
                            });
                            frm.reload_doc();
                        }
                    }
                });
            }
        });

        d.show();
    },

    custom_unit_size_of_packing_kg: function (frm) {
        calculate_total_qty(frm);
    },

    custom_total_no_of_packing_units_in_a_container: function (frm) {
        calculate_total_qty(frm);
    },
    custom_total_no_of_ccontainers: function (frm) {
        calculate_total_qty(frm);
    },

    custom_inquiry_source: function (frm) {
        let source = frm.doc.custom_inquiry_source;

        let options_map = {
            "Direct Inbound (High Intent)": [
                "Email Inquiry",
                "Website Form Submission",
                "WhatsApp Message",
                "Phone Call (Inbound)",
                "LinkedIn Message"
            ],
            "Outbound Triggered (You initiated)": [
                "Email Campaign Response",
                "Cold Email Reply",
                "Cold Call Response",
                "LinkedIn Outreach Response"
            ],
            "Relationship-Based": [
                "Existing Customer Repeat Inquiry",
                "Referral - Customer",
                "Referral - Partner / Agent",
                "Referral - Internal"
            ],
            "Sales Process Driven": [
                "Sample Follow-up",
                "Previous Quotation Follow-up",
                "Negotiation Continuation",
                "Re-engagement (Dormant Lead)"
            ],
            "Events / Offline Triggered": [
                "Exhibition Follow-up",
                "Conference Follow-up",
                "Meeting Follow-up",
                "Plant Visit Follow-up"
            ]
        };

        if (source && options_map[source]) {
            frm.set_df_property(
                "custom_specific_inquiry_source",
                "options",
                options_map[source].join("\n")
            );
            frm.set_df_property("custom_specific_inquiry_source", "hidden", 0);
        } else {
            frm.set_df_property("custom_specific_inquiry_source", "hidden", 1);
        }
    }
});

function calculate_total_qty(frm) {
    let unit_size = frm.doc.custom_unit_size_of_packing_kg || 0;
    let total_units = frm.doc.custom_total_no_of_packing_units_in_a_container || 0;
    let total_containers = frm.doc.custom_total_no_of_ccontainers || 0;
    frm.set_value('custom_max_qty_suffered_in_container', unit_size * total_units);
    frm.set_value('custom_total_qty_inquired', total_containers * total_units * unit_size);
}


function contact_details(frm) {
    if (frm.doc.custom_contact_person) {

        frappe.db.get_doc('Contact', frm.doc.custom_contact_person)
            .then(contact => {

                let details = [];

                // Email
                if (contact.email_id) {
                    details.push("Email: " + contact.email_id);
                }

                // Mobile / Phone
                if (contact.mobile_no) {
                    details.push("Mobile: " + contact.mobile_no);
                } else if (contact.phone) {
                    details.push("Phone: " + contact.phone);
                }

                // Set combined details
                frm.set_value(
                    'custom_contact_details',
                    details.join("\n")
                );

            });

    }
}