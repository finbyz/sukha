frappe.ui.form.on('Opportunity', {

    onload: function (frm) {
        if (frm.doc.custom_posting_date === "now") {
            frm.set_value("custom_posting_date", frappe.datetime.get_today());
        }
    },
    custom_packing_type(frm) {
        frm.set_value("custom_std_pakcing", "");
        apply_std_packing_filter(frm);
    },
     custom_country_of__destination__ship_to_destination(frm) {
        set_port_filter(frm);
        frm.set_value("custom_port_of_destination_c", ""); // clear old value
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

        if (frm.doc.docstatus === 0) {
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
                            onchange: function() {
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
                    primary_action: function(values) {
                        d.hide();
                        // Prepare data object to pass to Cost Sheet Dashboard
                        const costSheetData = {
                            opportunity: frm.doc.name,
                            opportunity_from: frm.doc.opportunity_from,
                            party_name: frm.doc.party_name,
                            customer_name: frm.doc.customer_name,

                            // Product details
                            product: frm.doc.custom_product_name,
                            product_grade: frm.doc.custom_product_grade,

                            // Parties
                            customer: frm.doc.opportunity_from === 'Customer' ? frm.doc.party_name : '',
                            supplier: frm.doc.custom_preferred_supplier,
                            customer_payment_term: frm.doc.custom_customer_desired_payment_terms,

                            // Logistics
                            country_of_destination: frm.doc.custom_country_of__destination__ship_to_destination,
                            port_of_discharge: frm.doc.custom_port_of_destination_c,
                            port_of_loading: frm.doc.custom_port_of_loading,
                            delivery_location: frm.doc.custom_destination__place_of_delivery,
                            shipping_line: frm.doc.custom_preferred_shipping_line,

                            // Incoterm and type selected from dialog
                            incoterm: values.incoterm,
                            origin_scope: values.origin_scope,
                            exw_sub_type: values.incoterm === 'EXW' ? (values.exw_sub_type || 'Domestic') : '',

                            // Container and packing
                            container_type: frm.doc.custom_container_type,
                            packing_type: frm.doc.custom_packing_type,
                            std_packing: frm.doc.custom_std_pakcing,
                            packing_unit_size: frm.doc.custom_unit_size_of_packing_kg,
                            units_per_fcl: frm.doc.custom_total_no_of_packing_units_in_a_container,
                            total_fcl: frm.doc.custom_total_no_of_ccontainers,

                            // Lead/Prospect handling
                            lead: frm.doc.opportunity_from === 'Lead' ? frm.doc.party_name : '',
                            prospect: (frm.doc.opportunity_from === 'Prospect' ||
                                frm.doc.opportunity_from === 'Prospect (L3/Qualified)') ? frm.doc.party_name : ''
                        };

                        // Store data in localStorage for Dashboard to pick up
                        localStorage.setItem('cost_sheet_load_data', JSON.stringify(costSheetData));

                        // Navigate to Cost Sheet Dashboard
                        frappe.set_route('cost-sheet-dashboard');

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
    frm.set_query("custom_port_of_destination_c", function () {
        return {
            filters: {
                country: frm.doc.custom_country_of__destination__ship_to_destination
            }
        };
    });
}