frappe.ui.form.on('Opportunity', {

    onload: function (frm) {
        if (frm.doc.custom_posting_date === "now") {
            frm.set_value("custom_posting_date", frappe.datetime.get_today());
        }

        // Disable standard lost dialog and register our custom one locally
        frappe.ui.form.off("Opportunity", "set_as_lost_dialog");
        frappe.ui.form.on("Opportunity", "set_as_lost_dialog", function (frm) {
            show_custom_lost_dialog(frm);
        });
    },
    custom_packing_type(frm) {
        frm.set_value("custom_std_pakcing", "");
        apply_std_packing_filter(frm);
    },
    custom_country_of__destination__ship_to_destination(frm) {
        set_port_filter(frm);
        frm.set_value("custom_port_of_destination", ""); // clear old value
    },
    refresh: function (frm) {
        contact_details(frm);

        frm.set_query("custom_packing_type", function () {

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

        if (frm.doc.custom_product_name && frm.doc.custom_packing_type) {
            apply_std_packing_filter(frm);
        }

        if (frm.is_new() && (!frm.doc.custom_posting_date || frm.doc.custom_posting_date === "now")) {
            frm.set_value("custom_posting_date", frappe.datetime.get_today());
        }

        if (frm.doc.docstatus === 0 && !frm.is_new() && frappe.model.can_create("Cost Sheet") && frappe.model.can_read("Cost Sheet")) {
            frappe.db.get_value("Cost Sheet", { inquiry: frm.doc.name }, "name").then(r => {
                if (!r || !r.message || !r.message.name) {
                    frm.add_custom_button(__('Cost Sheet'), function () {
                        let d = new frappe.ui.Dialog({
                            title: __('Select Cost Sheet Parameters'),
                            fields: [
                                {
                                    label: __('Base Incoterm'),
                                    fieldname: 'incoterm',
                                    fieldtype: 'Select',
                                    options: ['CIF', 'FOB', 'EXW'],
                                    default: frm.doc.custom_incoterm || 'CIF',
                                    reqd: 1,
                                    onchange: function () {
                                        let val = this.get_value();
                                        if (val === 'EXW') {
                                            d.set_df_property('exw_sub_type', 'hidden', 0);
                                            d.set_value('exw_sub_type', 'Domestic');
                                        } else {
                                            d.set_df_property('exw_sub_type', 'hidden', 1);
                                            d.set_value('exw_sub_type', '');
                                        }
                                    }
                                },
                                {
                                    label: __('Sourcing Origin Scope'),
                                    fieldname: 'origin_scope',
                                    fieldtype: 'Select',
                                    options: ['India', 'TC'],
                                    default: 'India',
                                    reqd: 1
                                },
                                {
                                    label: __('EXW Sale Sub-Type'),
                                    fieldname: 'exw_sub_type',
                                    fieldtype: 'Select',
                                    options: ['Domestic', 'Merchant', 'Repacking Service'],
                                    default: 'Domestic'
                                }
                            ],
                            primary_action_label: __('Proceed'),
                            primary_action: function (values) {
                                d.hide();
                                const params = new URLSearchParams({
                                    source_doctype: 'Opportunity',
                                    source_name: frm.doc.name,
                                    incoterm: values.incoterm,
                                    origin_scope: values.origin_scope,
                                    exw_sub_type: values.incoterm === 'EXW' ? (values.exw_sub_type || 'Domestic') : ''
                                });

                                // Navigate with a small, reload-safe URL context.
                                window.location.href = `/app/cost-sheet-dashboard?${params.toString()}`;

                                // Show notification
                                frappe.show_alert({
                                    message: __('Opening Cost Sheet Dashboard with Opportunity data...'),
                                    indicator: 'blue'
                                }, 3);
                            }
                        });

                        // Toggle visibility based on initial value of incoterm
                        let initial_incoterm = d.get_value('incoterm');
                        if (initial_incoterm !== 'EXW') {
                            d.set_df_property('exw_sub_type', 'hidden', 1);
                            d.set_value('exw_sub_type', '');
                        }

                        d.show();

                    }, __('Create'));
                }
            }).catch(() => {
                // Ignore errors silently if get_value fails for some reason
            });
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

        if (!frm.doc.custom_product_name) {
            return;
        }

        frm.set_value("custom_packing_type", "");
        frm.set_value("custom_std_pakcing", "");

        frappe.db.get_doc("Item", frm.doc.custom_product_name)
            .then(item => {

                // Packing Type options from Item
                frm.packing_types = (item.custom_packing_type || [])
                    .map(row => row.packing_type)
                    .filter(Boolean);

                frm.refresh_field("custom_packing_type");
            });
    },
    // custom_product_name(frm) {

    //     if (!frm.doc.custom_product_name) return;

    //     frappe.call({
    //         method: "frappe.client.get",
    //         args: {
    //             doctype: "Item",
    //             name: frm.doc.custom_product_name
    //         },
    //         callback(r) {

    //             if (!r.message) return;

    //             frm.packing_types = (r.message.custom_packing_type || [])
    //                 .map(row => row.packing_type)
    //                 .filter(Boolean);

    //             frm.set_value("custom_packing_type", "");

    //         }
    //     });
    // },

    create_prospect_from_opportunity: async function (frm, prospect_type) {
        let lead = await frappe.db.get_doc("Lead", frm.doc.party_name);
        let d = new frappe.ui.Dialog({
            title: __('Create L3/Qualified Lead'),
            fields: [
                {
                    label: __('L3/Qualified Lead Name'),
                    fieldname: 'prospect_name',
                    fieldtype: 'Data',
                    default: lead.company_name || lead.lead_name,
                    reqd: 1,
                    description: __('Name of the company / prospect')
                },
            ],
            primary_action_label: __('Create L3/Qualified Lead'),
            primary_action: function (values) {
                if (!values.prospect_name) {
                    frappe.msgprint(__('Please enter a L3/Qualified Lead Name.'));
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
                    freeze_message: __('Creating L3/Qualified Lead..'),
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

// function apply_std_packing_filter(frm) {
//     if (!frm.doc.custom_product_name || !frm.doc.custom_packing_type) return;

//     frappe.call({
//         method: "frappe.client.get",
//         args: { doctype: "Item", name: frm.doc.custom_product_name },
//         callback(r) {
//             if (!r.message) return;

//             // Step 1: Match packing_type in item's custom_std_pakcing
//             let matched = (r.message.custom_std_pakcing || [])
//                 .filter(row => row.packing_type === frm.doc.custom_packing_type)
//                 .map(row => row.std_packing);  // e.g. ["190 KG", "1195 KG"]

//             // Step 2: Filter the link field to show only those
//             frm.set_query("custom_std_pakcing", function () {
//                 return {
//                     filters: {
//                         name: ["in", matched.length ? matched : ["__no_value__"]]
//                     }
//                 };
//             });
//         }
//     });
// }

function apply_std_packing_filter(frm) {

    if (
        !frm.doc.custom_product_name ||
        !frm.doc.custom_packing_type
    ) {
        return;
    }

    frappe.db.get_doc("Item", frm.doc.custom_product_name)
        .then(item => {

            // Item child table fieldname
            const matched_std_packings =
                (item.custom_standard_packing || [])
                    .filter(row =>
                        row.packing_type === frm.doc.custom_packing_type
                    )
                    .map(row => row.std_packing)
                    .filter(Boolean);

            console.log(
                "Selected Packing Type:",
                frm.doc.custom_packing_type
            );

            console.log(
                "Matched Std Packing:",
                matched_std_packings
            );

            frm.set_query("custom_std_pakcing", () => {
                return {
                    filters: {
                        name: [
                            "in",
                            matched_std_packings.length
                                ? matched_std_packings
                                : ["__NO_VALUE__"]
                        ]
                    }
                };
            });

            frm.refresh_field("custom_std_pakcing");

            // Auto select if only one option
            if (matched_std_packings.length === 1) {
                frm.set_value(
                    "custom_std_pakcing",
                    matched_std_packings[0]
                );
            }
        });
}


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


function set_port_filter(frm) {
    frm.set_query("custom_port_of_destination", function () {
        return {
            filters: {
                country: frm.doc.custom_country_of__destination__ship_to_destination
            }
        };
    });
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
                // child_doctype: child_doctype,
            },
        };
    });

    dialog.show();
}