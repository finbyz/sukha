frappe.ui.form.on('Lead', {
    onload: function(frm) {
        set_port_filter(frm);
        // Show popup only for new document
        if (frm.is_new()) {
            let d = new frappe.ui.Dialog({
                title: "Select Sales Type",
                fields: [
                    {
                        label: "Sales Type",
                        fieldname: "sales_type",
                        fieldtype: "Select",
                        options: [
                            "Domestic / Merchant",
                            "Direct Export Sales"
                        ],
                        reqd: 1
                    }
                ],
                primary_action_label: "Set",
                primary_action(values) {
                    const set_value_result = frm.set_value("custom_sales_type", values.sales_type);

                    const after_sales_type = () => {
                        if (values.sales_type === "Domestic / Merchant") {
                            frm.set_df_property("custom_domestic_merchant_button", "hidden", 0);
                        }
                        frm.trigger("custom_sales_type");

                        if (values.sales_type === "Direct Export Sales") {
                            frm.events.show_direct_export_quick_entry_dialog(frm);
                        }
                    };

                    if (set_value_result && typeof set_value_result.then === "function") {
                        set_value_result.then(after_sales_type);
                    } else {
                        after_sales_type();
                    }

                    d.hide();
                }
            });
            
            d.show();
        }
    },
    custom_create_contact(frm)
    {
        const dialog = new frappe.ui.Dialog({
            title: __('Create Contact'),
            fields: [
                {
                    label: __('First Name'),
                    fieldname: 'first_name',
                    fieldtype: 'Data',
                    reqd: 1,
                },
                {
                    label: __('Last Name'),
                    fieldname: 'last_name',
                    fieldtype: 'Data',
                },
                {
                    label: __('Designation'),
                    fieldname: 'designation',
                    fieldtype: 'Data',
                },
                {
                    label: __('Gender'),
                    fieldname: 'gender',
                    fieldtype: 'Link',
                    options: 'Gender'
                },
                {
                    label: __('Email ID'),
                    fieldname: 'email_id',
                    fieldtype: 'Data',
                    options: 'email',
                },
                {
                    label: __('Phone'),
                    fieldname: 'phone',
                    fieldtype: 'Phone',
                    length: '10',
                    options: 'phone'
                }
            ],
            primary_action_label: __('Save'),
            primary_action: async (values) => {
                if (!values.first_name) {
                    frappe.msgprint({
                        title: __('Validation'),
                        message: __('First Name is required'),
                        indicator: 'red'
                    });
                    return;
                }

                const response = await frappe.call({
                    method: 'sukha.doc_events.prospect.create_contact_from_dialog',
                    args: values,
                    freeze: true,
                });

                if (!response.exc && response.message) {
                    frm.set_value('custom_contact_person', response.message);
                    frm.refresh_field('custom_contact_person');
                    dialog.hide();
                    frappe.show_alert({
                        message: __('Contact created: {0}', [response.message]),
                        indicator: 'green'
                    });
                }
            },
            secondary_action_label: __('Cancel'),
            secondary_action: function() {
                dialog.hide();
            }
        });

        dialog.show();
    },
    custom_namee_of_the_company(frm)
    {
        frm.set_value("custom_bill_to_party_name",frm.doc.custom_namee_of_the_company)

    },
    custom_product(frm){
        frm.set_value("custom_product_name",frm.doc.custom_product)

    },
    custom_country_of_destination(frm) {
        set_port_filter(frm);
        frm.set_value("custom_port_of_destination", ""); // clear old value
    },
    custom_sales_type(frm) {
        frm.refresh_fields();
        frm.refresh();
        if (frm.layout && frm.layout.refresh) {
            setTimeout(() => frm.layout.refresh(), 50);
        }
    },
    first_name(frm)
    {
        frm.set_value("custom_first_name_s",frm.doc.first_name)
    },
    last_name(frm)
    {
        frm.set_value("custom_last_names",frm.doc.last_name)
    },
    type(frm)
    {
        frm.set_value("custom_lead_type_s",frm.doc.type)
    },
    custom_first_name_s(frm) {
    frm.set_value("first_name", frm.doc.custom_first_name_s)
    },
    custom_last_names(frm) {
        frm.set_value("last_name", frm.doc.custom_last_names)
    },
    custom_lead_type_s(frm) {
        frm.set_value("type", frm.doc.custom_lead_type_s)
    },
    custom_product_name(frm)
    {
        frm.set_value("custom_product_from_l1",frm.doc.custom_product_name)
    },

    show_direct_export_quick_entry_dialog: function(frm) {
        const d = new frappe.ui.Dialog({
            title: "Direct Export Sales Quick Entry",
            fields: [
                { fieldtype: "Data", label: "First Name", fieldname: "custom_first_name_s",reqd:1 },
                { fieldtype: "Data", label: "Last Name", fieldname: "custom_last_names" },
                { fieldtype: "Select", label: "Lead Type", fieldname: "custom_lead_type_s", options: "Client\nChannel Partner\nConsultant",reqd:1 },
                { fieldtype: "Select", label: "Request Type", fieldname: "custom_request_type_s", options: "Product Enquiry\nRequest for Information\nSuggestions\nOther" },
                { fieldtype: "Data", label: "Product", fieldname: "custom_product" },
                { fieldtype: "Data", label: "Country of HQ", fieldname: "custom_country_of_hq" },
                { fieldtype: "Data", label: "Organisation", fieldname: "custom_organisations" },
                { fieldtype: "Data", label: "Name of the Company", fieldname: "custom_namee_of_the_company" },
                { fieldtype: "Phone", label: "Board Number", fieldname: "custom_board__number" },
                { fieldtype: "Data", label: "Central Email ID", fieldname: "custom_central_email_id" },
                { fieldtype: "Select", label: "Type of Buyer", fieldname: "custom_buyer_type", options: "Manufacturer\nTrader\nEnd User\nAgent\nOther" }
            ],
            primary_action_label: "Edit Full Form",
            primary_action(values) {
                const set_values = Object.keys(values).map(fieldname => {
                    if (values[fieldname] !== undefined && values[fieldname] !== null) {
                        const result = frm.set_value(fieldname, values[fieldname]);
                        return result && typeof result.then === "function" ? result : Promise.resolve();
                    }
                    return Promise.resolve();
                });

                Promise.all(set_values).then(() => {
                    frm.trigger("custom_sales_type");
                    frm.refresh();
                    if (frm.layout && frm.layout.select_tab) {
                        frm.layout.select_tab("custom_l0marketing_research");
                    }
                    d.hide();
                });
            }
        });
        d.show();
    },

    make_opportunity_direct: function(frm) {

        let buyer_type = frm.doc.custom_buyer_type;
        let sales_type = frm.doc.custom_sales_type;

        if (sales_type === "Domestic / Merchant" && !buyer_type) {
            frappe.msgprint({
                title: __("Validation"),
                message: __("Please select Buyer Type first"),
                indicator: "red"
            });
            return;
        }

        frappe.call({
            method: "sukha.override.lead_override.create_opportunity_with_buyer_type",
            args: {
                lead_name: frm.doc.name,
                buyer_type: buyer_type,
                sales_type: sales_type
            },
            freeze: true,
            callback: function(r) {
                if (!r.exc && r.message) {
                    frappe.set_route("Form", "Opportunity", r.message);
                }
            }
        });
    },

    refresh: function(frm) {

        frm.set_query("port_destination", "custom_commercials__logistic", function(doc, cdt, cdn) {
            const row = locals[cdt][cdn];
            return {
                filters: {
                    country: row.country_of_destination
                }
            };
        });

        // Remove standard Opportunity button
        frm.remove_custom_button(__('Opportunity'), __('Create'));

        // Override standard Create > Opportunity
        frm.add_custom_button(__('Opportunity'), () => {

            frm.events.make_opportunity_direct(frm);

        }, __('Create'));
    },
    custom_contact_person(frm){
        frm.set_value('custom_contact_person_for_soft_inquiry',frm.doc.custom_contact_person)
    },
    custom_contact_person_phone_number(frm){
        frm.set_value('custom_contact_number',frm.doc.custom_contact_person_phone_number)
    },
    custom_contact_person_phone_email_id(frm){
        frm.set_value('custom_contact_person_email_id',frm.doc.custom_contact_person_phone_email_id)
    },
    custom_contact_person_designation__department(frm){
        frm.set_value('custom_designation',frm.doc.custom_contact_person)
    },
    
    
    // Keep your existing functions below
    custom_same_as_phone: function(frm) {
        if (frm.doc.custom_same_as_phone) {
            if (frm.doc.custom_contact_person_phone_number) {
                frm.set_value(
                    "custom_contact_person_whatsapp_number",
                    frm.doc.custom_contact_person_phone_number
                );
            } else {
                frappe.msgprint({
                    title: "Validation",
                    message: "Please enter Phone Number first to fetch it.",
                    indicator: "red"
                });
                frm.set_value("custom_same_as_phone", 0);
            }
        }
    },
    
    custom_source_of_the_lead: function(frm) {
        let source = frm.doc.custom_source_of_the_lead;
        
        let options_map = {
            "Digital Sources": [
                "Website Inquiry",
                "LinkedIn Organic",
                "LinkedIn Paid",
                "Google Search",
                "Email Campaign"
            ],
            "Offline Sources": [
                "Exhibition / Trade Show",
                "Conference / Seminar",
                "Plant Visit",
                "Cold Call"
            ],
            "Network Sources": [
                "Referral - Existing Customer",
                "Referral - Partner, Agents",
                "Referral - Employee"
            ],
            "Data Sources": [
                "Purchased Database / EXIM data",
                "Internal Database",
                "Previous Inquiry"
            ],
            // "Other": [
            //     "Specific Text"
            // ]
        };
        
        if (source && options_map[source]) {
            frm.set_df_property(
                "custom_specific_source",
                "options",
                options_map[source].join("\n")
            );
            
            frm.set_df_property("custom_specific_source", "hidden", 0);
        }
    },
    
    refresh: function(frm) {
        frm.set_query("port_destination", "custom_commercials__logistic", function(doc, cdt, cdn) {
            const row = locals[cdt][cdn];
            return {
                filters: {
                    country: row.country_of_destination
                }
            };
        });
        setTimeout(() => {
            frm.remove_custom_button(__('Opportunity'), __('Create'));
            frm.remove_custom_button(__('Customer'), __('Create'));
            frm.remove_custom_button(__('Quotation'), __('Create'));
            frm.remove_custom_button(__('Prospect'), __('Create'));
        }, 100);
        
        frm.add_custom_button(__('Soft Inquiry'), () => {
            frm.events.make_opportunity_direct(frm);
        }, __('Create'));
    },
    
    async make_opportunity(frm) {
        console.log("Making Opportunity from Lead");
        
        let existing_prospect = (
            await frappe.db.get_value(
                "Prospect Lead",
                { lead: frm.doc.name },
                "name"
            )
        ).message?.name;
        
        let fields = [];
        
        if (!existing_prospect) {
            fields.push(
                {
                    label: "Create Prospect",
                    fieldname: "create_prospect",
                    fieldtype: "Check",
                    default: 1,
                },
                {
                    label: "Prospect Name",
                    fieldname: "prospect_name",
                    fieldtype: "Data",
                    default: frm.doc.company_name,
                    depends_on: "create_prospect",
                    mandatory_depends_on: "create_prospect",
                }
            );
        }
        
        await frm.reload_doc();
        
        let existing_contact = (
            await frappe.db.get_value(
                "Contact",
                {
                    first_name: frm.doc.first_name || frm.doc.lead_name,
                    last_name: frm.doc.last_name,
                },
                "name"
            )
        ).message?.name;
        
        if (!existing_contact) {
            fields.push({
                label: "Create Contact",
                fieldname: "create_contact",
                fieldtype: "Check",
                default: "1",
            });
        }
        
        if (fields.length) {
            const d = new frappe.ui.Dialog({
                title: __("Create Opportunity"),
                fields: fields,
                primary_action: function(data) {
                    frappe.call({
                        method: "sukha.doc_events.prospect.create_prospect_and_contact",
                        args: {
                            docname: frm.doc.name,
                            data: data
                        },
                        freeze: true,
                        callback: function(r) {
                            if (!r.exc) {
                                frappe.model.open_mapped_doc({
                                    method: "erpnext.crm.doctype.lead.lead.make_opportunity",
                                    frm: frm,
                                });
                            }
                            d.hide();
                        },
                    });
                },
                primary_action_label: __("Create"),
            });
            
            d.show();
        } else {
            frappe.model.open_mapped_doc({
                method: "erpnext.crm.doctype.lead.lead.make_opportunity",
                frm: frm,
            });
        }
    }
});

function set_port_filter(frm) {
    frm.set_query("custom_port_of_destination", function () {
        return {
            filters: {
                country: frm.doc.custom_country_of_destination
            }
        };
    });
}
