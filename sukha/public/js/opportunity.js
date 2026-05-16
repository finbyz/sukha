// frappe.ui.form.on('Opportunity', {

//     onload: function(frm) {
//         // Fix custom_posting_date if it's set to "now" string
//         if (frm.doc.custom_posting_date === "now") {
//             frm.set_value("custom_posting_date", frappe.datetime.get_today());
//         }
//         if (frm.is_new()) {
//             if (!frm.doc.custom_inquiry_owner) {
//                 frm.set_value("custom_inquiry_owner", frappe.session.user);
//             }
//         }
//     },

//     refresh: function(frm) {
//         // Set custom_posting_date to today's date if it's new and empty or "now"
//         if (frm.is_new() && (!frm.doc.custom_posting_date || frm.doc.custom_posting_date === "now")) {
//             frm.set_value("custom_posting_date", frappe.datetime.get_today());
//         }

//         // Add custom button to create Prospect
//         if (!frm.is_new() && frm.doc.opportunity_from === "Lead") {
//             frm.add_custom_button(__('Create Prospect'), function() {
//                 frm.events.create_prospect_from_opportunity(frm);
//             }, __('Create'));
//         }
//     },

//     create_prospect_from_opportunity: async function(frm) {
//         // Check if prospect already exists for this lead
//         let existing_prospect = await frappe.db.get_value(
//             "Prospect Lead",
//             { lead: frm.doc.party_name },
//             "parent"
//         );

//         if (existing_prospect && existing_prospect.message && existing_prospect.message.parent) {
//             frappe.msgprint({
//                 title: __('Prospect Already Exists'),
//                 message: __('A Prospect <a href="/app/prospect/{0}">{0}</a> already exists for this Lead.', 
//                     [existing_prospect.message.parent]),
//                 indicator: 'orange'
//             });
//             return;
//         }

//         // Get lead details
//         let lead = await frappe.db.get_doc("Lead", frm.doc.party_name);

//         // Show dialog to create prospect
//         let d = new frappe.ui.Dialog({
//             title: __('Create Prospect'),
//             fields: [
//                 {
//                     label: __('Prospect Name'),
//                     fieldname: 'prospect_name',
//                     fieldtype: 'Data',
//                     default: lead.company_name || lead.lead_name,
//                     reqd: 1,
//                     description: __('Name of the company/prospect')
//                 },
//                 {
//                     fieldtype: 'Section Break'
//                 },
//                 {
//                     label: __('Create Contact'),
//                     fieldname: 'create_contact',
//                     fieldtype: 'Check',
//                     default: 1,
//                     description: __('Create a contact from Lead information')
//                 }
//             ],
//             primary_action_label: __('Create Prospect'),
//             primary_action: function(values) {
//                 frappe.call({
//                     method: 'sukha.override.opportunity_override.create_prospect_from_opportunity',
//                     args: {
//                         opportunity_name: frm.doc.name,
//                         lead_name: frm.doc.party_name,
//                         prospect_name: values.prospect_name,
//                         create_contact: values.create_contact
//                     },
//                     freeze: true,
//                     freeze_message: __('Creating Prospect...'),
//                     callback: function(r) {
//                         if (!r.exc && r.message) {
//                             d.hide();
//                             frappe.msgprint({
//                                 title: __('Success'),
//                                 message: __('Prospect <a href="/app/prospect/{0}">{0}</a> created successfully!', 
//                                     [r.message]),
//                                 indicator: 'green'
//                             });
//                             frm.reload_doc();
//                         }
//                     }
//                 });
//             }
//         });

//         d.show();
//     },

//     custom_max_qty_in_container: function(frm) {
//         calculate_total_qty(frm);
//     },

//     custom_total_no_of_ccontainers: function(frm) {
//         calculate_total_qty(frm);
//     },
//     custom_inquiry_source: function (frm) {
//         let source = frm.doc.custom_inquiry_source;

//         let options_map = {
//             "Direct Inbound (High Intent)": [
//                 "Email Inquiry",
//                 "Website Form Submission",
//                 "WhatsApp Message",
//                 "Phone Call (Inbound)",
//                 "LinkedIn Message"
//             ],

//             "Outbound Triggered (You initiated)": [
//                 "Email Campaign Response",
//                 "Cold Email Reply",
//                 "Cold Call Response",
//                 "LinkedIn Outreach Response"
//             ],

//             "Relationship-Based": [
//                 "Existing Customer Repeat Inquiry",
//                 "Referral - Customer",
//                 "Referral - Partner / Agent",
//                 "Referral - Internal"
//             ],

//             "Sales Process Driven": [
//                 "Sample Follow-up",
//                 "Previous Quotation Follow-up",
//                 "Negotiation Continuation",
//                 "Re-engagement (Dormant Lead)"
//             ],

//             "Events / Offline Triggered": [
//                 "Exhibition Follow-up",
//                 "Conference Follow-up",
//                 "Meeting Follow-up",
//                 "Plant Visit Follow-up"
//             ]
//         };

//         if (source && options_map[source]) {

//             frm.set_df_property(
//                 "custom_specific_inquiry_source",
//                 "options",
//                 options_map[source].join("\n")
//             );

//             frm.set_df_property("custom_specific_inquiry_source", "hidden", 0);
//         }
//     },
    
//     party_name: function(frm) {
//         let party = frm.doc.party_name;

//         if (!party) return;

//         if (frm.doc.opportunity_from === "Lead") {

//             frappe.db.get_doc("Lead", party).then(doc => {
//                 frm.set_value("custom_inquiry_owner", doc.lead_name);
//             });

//         } else if (frm.doc.opportunity_from === "Customer") {

//             frappe.db.get_doc("Customer", party).then(doc => {
//                 frm.set_value("custom_inquiry_owner", doc.customer_name || doc.name);
//             });

//         } else {

//             frappe.db.get_doc("Prospect", party).then(doc => {
//                 frm.set_value("custom_inquiry_owner", doc.prospect_owner);
//             });
//         }
//     }

// });

// function calculate_total_qty(frm) {
//     let max_qty = frm.doc.custom_max_qty_in_container || 0;
//     let total_containers = frm.doc.custom_total_no_of_ccontainers || 0;

//     let total_qty = max_qty * total_containers;

//     frm.set_value('custom_total_qty_inquired', total_qty);
// }

frappe.ui.form.on('Opportunity', {

    onload: function(frm) {
        if (frm.doc.custom_posting_date === "now") {
            frm.set_value("custom_posting_date", frappe.datetime.get_today());
        }
        // if (frm.is_new()) {
        //     if (!frm.doc.custom_inquiry_owner) {
        //         frm.set_value("custom_inquiry_owner", frappe.session.user);
        //     }
        // }
    },

    refresh: function(frm) {
        contact_details(frm);
        // Set custom_posting_date to today if new and empty or "now"
        if (frm.is_new() && (!frm.doc.custom_posting_date || frm.doc.custom_posting_date === "now")) {
            frm.set_value("custom_posting_date", frappe.datetime.get_today());
        }

        // Add custom button to create Prospect (only for Lead-based opportunities)
        
        if ( frm.doc.custom_type_of_buyer) {
            frm.add_custom_button(__('L3-Prospect'), function() {
                frm.events.create_prospect_from_opportunity(frm, 'l3');
            }, __('Create'));
        }
        if ( frm.doc.custom_buyer_type) {
            frm.add_custom_button(__('Qualified Lead'), function() {
                frm.events.create_prospect_from_opportunity(frm, 'qualified_lead');
            }, __('Create'));
        }
        
    },
    custom_contact_person(frm){
        contact_details(frm);

    },
    create_prospect_from_opportunity: async function(frm, prospect_type) {
        // Removed validation - Allow multiple Prospects per Lead
        
        // Get lead details to pre-fill dialog
        let lead = await frappe.db.get_doc("Lead", frm.doc.party_name);

        // Show dialog
        let d = new frappe.ui.Dialog({
            title: __('Create Prospect'),
            fields: [
                {
                    label:       __('Prospect Name'),
                    fieldname:   'prospect_name',
                    fieldtype:   'Data',
                    default:     lead.company_name || lead.lead_name,
                    reqd:        1,
                    description: __('Name of the company / prospect')
                },
                {
                    fieldtype: 'Section Break'
                },
                {
                    label:       __('Create Contact'),
                    fieldname:   'create_contact',
                    fieldtype:   'Check',
                    default:     1,
                    description: __('Create a contact from Lead information')
                }
            ],
            primary_action_label: __('Create Prospect'),
            primary_action: function(values) {
                if (!values.prospect_name) {
                    frappe.msgprint(__('Please enter a Prospect Name.'));
                    return;
                }

                frappe.call({
                    method:   'sukha.override.opportunity_override.create_prospect_from_opportunity',
                    args: {
                        opportunity_name: frm.doc.name,
                        lead_name:        frm.doc.party_name,
                        prospect_name:    values.prospect_name,
                        create_contact:   values.create_contact ? 1 : 0,
                        prospect_type:    prospect_type
                    },
                    freeze:         true,
                    freeze_message: __('Creating Prospect...'),
                    callback: function(r) {
                        if (!r.exc && r.message) {
                            d.hide();
                            frappe.msgprint({
                                title:     __('Success'),
                                message:   __('Prospect <a href="/app/prospect/{0}">{0}</a> created successfully!',
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

    custom_unit_size_of_packing_kg: function(frm) {
        calculate_total_qty(frm);
    },

    custom_total_no_of_packing_units_in_a_container: function(frm) {
        calculate_total_qty(frm);
    },
    custom_total_no_of_ccontainers: function(frm) {
        calculate_total_qty(frm);
    },

    custom_inquiry_source: function(frm) {
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
    },

    // party_name: function(frm) {
    //     let party = frm.doc.party_name;
    //     if (!party) return;

    //     if (frm.doc.opportunity_from === "Lead") {
    //         frappe.db.get_doc("Lead", party).then(doc => {
    //             frm.set_value("custom_inquiry_owner", doc.lead_name);
    //         });
    //     } else if (frm.doc.opportunity_from === "Customer") {
    //         frappe.db.get_doc("Customer", party).then(doc => {
    //             frm.set_value("custom_inquiry_owner", doc.customer_name || doc.name);
    //         });
    //     } else {
    //         frappe.db.get_doc("Prospect", party).then(doc => {
    //             frm.set_value("custom_inquiry_owner", doc.prospect_owner);
    //         });
    //     }
    // }

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