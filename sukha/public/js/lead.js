frappe.ui.form.on('Lead', {
    before_load: function (frm) {
        clear_lead_top_summary(frm);
    },
    custom_board__number(frm) {
        frm.set_value("phone", frm.doc.custom_board__number)
        frm.set_value("mobile_no", frm.doc.custom_board__number)
    },
    custom_central_email_id(frm) {
        frm.set_value("email_id", frm.doc.custom_central_email_id)
    },
    custom_product_from_l1(frm) {
        frm.clear_table("custom_commercials__logistic");
        if (frm.doc.custom_product_from_l1) {
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item",
                    name: frm.doc.custom_product_from_l1
                },
                callback: function (r) {
                    if (r.message) {
                        frm.packing_types = r.message.custom_packing_type
                            .map(d => d.packing_type)
                            .filter(Boolean);
                        frm.refresh_field("custom_commercials__logistic");
                    }
                }
            });
        }
    },
    onload: function (frm) {
        // Only show Items having Has Variants = 1
        if (frm.doc.custom_sales_type == "Direct Export Sales") {
            frm.set_query("custom_product", function () {
                return {
                    filters: {
                        has_variants: 1
                    }
                };
            });

           

            frm.set_query("custom_product_name", function () {
                return {
                    filters: {
                        has_variants: 1
                    }
                };
            });

            frm.set_query("product_name", "custom_other_products", function () {
                return {
                    filters: {
                        has_variants: 1,
                    }
                };
            });

            // Show only variants of selected Product Name
            frm.set_query("custom_product_from_l1", function () {
                if (!frm.doc.custom_product_name) {
                    return {
                        filters: {
                            name: ["=", ""]
                        }
                    };
                }

                return {
                    filters: {
                        variant_of: frm.doc.custom_product_name
                    }
                };
            });
        }
        clear_lead_top_summary(frm);
        set_port_filter(frm);

        // Set default tab for saved documents
        if (!frm.is_new()) {
            setTimeout(() => {
                if (frm.layout && frm.layout.select_tab) {
                    // Select tab based on sales type
                    if (frm.doc.custom_sales_type === "Direct Export Sales") {
                        frm.layout.select_tab("custom_l0marketing_research");
                    } else if (frm.doc.custom_sales_type === "Domestic / Merchant") {
                        frm.layout.select_tab("custom_lead_information");
                    }
                }
            }, 300);
        }

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
                            // Add any specific logic for Domestic/Merchant here
                        }
                        frm.trigger("custom_sales_type");

                        if (values.sales_type === "Direct Export Sales") {
                            // Add any specific logic for Direct Export here
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

    custom_save_l0: async function (frm) {

        if (
            frm.doc.custom_l1_status === "Saved" ||
            frm.doc.custom_l2_status === "Saved"
        ) {
            return;
        }

        try {
            frappe.dom.freeze(__("Saving L0..."));

            // ✅ Step 1: If doc is new or dirty, save it first so it exists in DB
            if (frm.is_new() || frm.is_dirty()) {
                frm.ignore_permission_validation = true;
                await frm.save();
            }

            // ✅ Step 2: Now call Python — doc exists in DB with real name
            await frappe.call({
                method: "sukha.doc_events.lead.save_l0_and_clear_contact",
                args: {
                    lead_name: frm.doc.name  // now a real name like CRM-LEAD-2026-00149
                }
            });

            // ✅ Step 3: Reload from DB — contact fields are empty, L0 status is Saved
            await frm.reload_doc();

            frappe.dom.unfreeze();

            frappe.show_alert({
                message: __("L0 Saved Successfully"),
                indicator: "green"
            });

        } catch (e) {
            frappe.dom.unfreeze();
            console.error(e);
            frappe.msgprint({
                title: __("Error"),
                message: __("Failed to save L0"),
                indicator: "red"
            });
        }
    },
    custom_save_l1: async function (frm) {
        if (frm.doc.custom_l2_status === "Saved") {
            return;
        }
        if (frm.doc.custom_l0_status !== "Saved") {

            frappe.msgprint({
                title: __("Validation"),
                message: __("Please save L0 details first."),
                indicator: "red"
            });

            return;
        }

        let variants = get_variant_products(frm);

        // Already created check
        if (frm.__variant_leads_created && variants?.length > 0) {

            let created_leads = frm.__created_variant_leads || [];

            let lead_html = created_leads.length
                ? created_leads.map(lead => `
                    <div style="margin-bottom:8px;">
                        <a href="/app/lead/${lead}" target="_blank">
                            ${lead}
                        </a>
                    </div>
                `).join("")
                : `<div>No leads found</div>`;

            frappe.confirm(
                `
                <div style="line-height:1.7;">

                    <p>
                        <b>Variant Leads already created.</b>
                    </p>

                    <p>Already created leads:</p>

                    <div style="
                        background:var(--control-bg);
                        padding:12px;
                        border-radius:8px;
                        max-height:220px;
                        overflow:auto;
                        margin-bottom:12px;
                    ">
                        ${lead_html}
                    </div>

                    <p>
                        Do you want to create more variant leads?
                    </p>

                </div>
                `,
                async () => {

                    await proceed_l1_save(frm, variants);

                },
                () => {

                    frappe.show_alert({
                        message: __("Cancelled"),
                        indicator: "orange"
                    });

                }
            );

            return;
        }

        await proceed_l1_save(frm, variants);
    },
    custom_product(frm) {
        frm.set_value("custom_product_name", frm.doc.custom_product)
        render_lead_top_summary(frm);

    },
    custom_product_name_m(frm) {
        render_lead_top_summary(frm);
    },
    custom_country_of_destination(frm) {
        set_port_filter(frm);
        frm.set_value("custom_port_of_destination", ""); // clear old value
    },
    custom_country_of_hq(frm) {
        render_lead_top_summary(frm);
    },
    custom_buyer_type(frm) {
        render_lead_top_summary(frm);
    },
    custom_type_of_buyer(frm) {
        render_lead_top_summary(frm);
    },
    custom_product_category(frm) {
        render_lead_top_summary(frm);
    },
    custom_volume_range(frm) {
        render_lead_top_summary(frm);
    },
    status(frm) {
        refresh_lead_status_display(frm);
    },
    custom_export_lead_status(frm) {
        refresh_lead_status_display(frm);
    },
    custom_l0_status(frm) {
        refresh_lead_status_display(frm);
    },
    custom_l1_status(frm) {
        refresh_lead_status_display(frm);
    },
    custom_l2_status(frm) {
        refresh_lead_status_display(frm);
    },
    custom_sales_type(frm) {
        frm.refresh_fields();
        frm.refresh();

        // Expand tabs for BOTH sales types, not just Direct Export Sales
        setTimeout(() => {
            if (frm.layout && frm.layout.refresh) {
                frm.layout.refresh();
            }

            // Expand all collapsed sections
            $(".form-section .section-head.collapsed").each(function () {
                $(this).trigger("click");
            });

            $(".form-dashboard-section .collapsed").each(function () {
                $(this).trigger("click");
            });

            // Select appropriate tab based on sales type
            if (frm.layout && frm.layout.select_tab) {
                if (frm.doc.custom_sales_type === "Direct Export Sales") {
                    frm.layout.select_tab("custom_l0marketing_research");
                } else if (frm.doc.custom_sales_type === "Domestic / Merchant") {
                    // Change "custom_lead_information" to your actual first tab name
                    // Check your form definition to find the correct fieldname
                    frm.layout.select_tab("custom_lead_information");
                }
            }
        }, 200);
    },
    first_name(frm) {
        frm.set_value("custom_first_name_s", frm.doc.first_name)
    },
    type(frm) {
        frm.set_value("custom_lead_type_s", frm.doc.type)
    },
    custom_first_name_s(frm) {
        frm.set_value("first_name", frm.doc.custom_first_name_s)
        frm.set_value("custom_bill_to_party_name", frm.doc.custom_first_name_s)
        render_lead_top_summary(frm);
    },
    custom_lead_type_s(frm) {
        frm.set_value("type", frm.doc.custom_lead_type_s)
    },
    custom_product_name(frm) {
        render_lead_top_summary(frm);
    },
    make_opportunity_direct: function (frm) {

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
            callback: function (r) {
                if (!r.exc && r.message) {
                    frappe.set_route("Form", "Opportunity", r.message);
                }
            }
        });
    },
    custom_save: async function (frm) {
        if (
            frm.doc.custom_l0_status !== "Saved" ||
            frm.doc.custom_l1_status !== "Saved"
        ) {
            return;
        }
        try {
            await frm.set_value(
                "custom_l2_status",
                "Saved"
            );
            frm.set_value("custom_export_lead_status", "L2")
            frm.set_value("custom_l2_status", "Saved")

            frm.ignore_permission_validation = true;
            await frm.save();
            frappe.show_alert({
                message: __("L2 Saved Successfully"),
                indicator: "green"
            });

        } catch (e) {

            console.error(e);

            frappe.msgprint({
                title: __("Error"),
                message: __("Failed to Save L2"),
                indicator: "red"
            });

        }
    },
    custom_contact_person: async function (frm) {
        if (frm.__clearing_for_l0_save) return;
        if (!frm.doc.custom_contact_person) return;

        if (!frm.is_new()) {
            frappe.call({
                method: "sukha.doc_events.lead.link_contact_to_lead",
                args: {
                    contact_name: frm.doc.custom_contact_person,
                    lead_name: frm.doc.name
                }
            });
        }

        try {
            let contact = await frappe.db.get_doc('Contact', frm.doc.custom_contact_person);
            let phone_number = "";

            if (contact.phone_nos && contact.phone_nos.length) {
                let phone_with_custom = contact.phone_nos.find(p => p.custom_contact_number);
                if (phone_with_custom) {
                    phone_number = phone_with_custom.custom_contact_number;
                }
            }

            if (phone_number) {
                frm.set_value('custom_contact_person_phone_number', phone_number);
            }
        } catch (error) {
            console.error("Error:", error);
        }
        frm.set_value('custom_contact_person_for_soft_inquiry', frm.doc.custom_contact_person)

        if (!frm.doc.custom_contact_person) {
            return;
        }
        if (contact.country) {
            frm.set_value(
                "custom_bill_to_party_country",
                contact.country
            );
        }

        try {

            let contact = await frappe.db.get_doc(
                "Contact",
                frm.doc.custom_contact_person
            );

            if (contact.phone) {

                frm.set_value(
                    "custom_contact_person_phone_number",
                    contact.phone
                );
            }

            else if (contact.mobile_no) {

                frm.set_value(
                    "custom_contact_person_phone_number",
                    contact.mobile_no
                );
            }

            if (contact.email_id) {

                frm.set_value(
                    "custom_contact_person_phone_email_id",
                    contact.email_id
                );
            }

            if (contact.designation) {

                frm.set_value(
                    "custom_contact_person_designation__department",
                    contact.designation
                );
            }
            if (
                contact.custom_visiting_card_attachment
            ) {
                frm.set_value(
                    "custom_attachment_",
                    contact.custom_visiting_card_attachment
                );
            }

        } catch (e) {

            console.error(e);

            frappe.msgprint({
                title: __("Error"),
                indicator: "red",
                message: __("Failed to fetch Contact details")
            });
        }
    },
    custom_contact_person_phone_number(frm) {
        frm.set_value('custom_contact_number', frm.doc.custom_contact_person_phone_number)
    },
    custom_contact_person_phone_email_id(frm) {
        frm.set_value('custom_contact_person_email_id', frm.doc.custom_contact_person_phone_email_id)
    },
    custom_contact_person_designation__department(frm) {
        frm.set_value('custom_designation', frm.doc.custom_contact_person_designation__department)
    },
    custom_contact_person_whatsapp_number(frm) {
        if (frm.doc.custom_same_as_phone) {
            frm.set_value('whatsapp_no', frm.doc.custom_contact_person_whatsapp_number)
        } else {

            frm.set_value('whatsapp_no', "")
        }
    },

    custom_same_as_phone: function (frm) {
        if (frm.doc.custom_same_as_phone == 1) {
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
            }
        }
        if (frm.doc.custom_same_as_phone == 0) {
            frm.set_value("custom_contact_person_whatsapp_number", "");
        }
    },

    custom_source_of_the_lead: function (frm) {
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


    refresh: function (frm) {
        // Only show Items having Has Variants = 1
        if (frm.doc.custom_sales_type == "Direct Export Sales") {
            frm.set_query("custom_product", function () {
                return {
                    filters: {
                        has_variants: 1
                    }
                };
            });

            frm.set_query("custom_product_name", function () {
                return {
                    filters: {
                        has_variants: 1
                    }
                };
            });

            // Show only variants of selected Product Name
            frm.set_query("custom_product_from_l1", function () {
                if (!frm.doc.custom_product_name) {
                    return {
                        filters: {
                            name: ["=", ""]
                        }
                    };
                }

                return {
                    filters: {
                        variant_of: frm.doc.custom_product_name
                    }
                };
            });
        }
        // L0 hidden after L0/L1/L2
        frm.set_df_property(
            "custom_save_l0",
            "hidden",
            frm.doc.custom_l0_status === "Saved"
            || frm.doc.custom_l1_status === "Saved"
            || frm.doc.custom_l2_status === "Saved"
        );

        // L1 hidden after L1/L2
        frm.set_df_property(
            "custom_save_l1",
            "hidden",
            frm.doc.custom_l1_status === "Saved"
            || frm.doc.custom_l2_status === "Saved"
        );

        // L2 hidden after L2
        frm.set_df_property(
            "custom_save",
            "hidden",
            frm.doc.custom_l2_status === "Saved"
        );
        if (frm.doc.custom_sales_type === "Direct Export Sales") {
            if (
                frm.doc.custom_l0_status === "Saved" &&
                frm.doc.custom_l1_status === "Saved"
            ) {

                frm.enable_save();
                frm.page.btn_primary.show();
            } else {
                frm.disable_save();
                frm.page.btn_primary.hide();
            }

        } else {
            frm.enable_save();
            frm.page.btn_primary.show();
        }


        refresh_lead_status_display(frm);

        frm.set_query("port_destination", "custom_commercials__logistic", function (doc, cdt, cdn) {
            const row = locals[cdt][cdn];
            return {
                filters: {
                    country: row.country_of_destination
                }
            };
        });

        frm.set_query("desired_packing", "custom_commercials__logistic", function (doc, cdt, cdn) {
            let packing_types = frm.packing_types || [];
            return {
                filters: {
                    name: ["in", packing_types.length > 0 ? packing_types : ["__NO_VALUE__"]]
                }
            };
        });

        if (frm.doc.custom_product_from_l1 && !frm.packing_types) {
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item",
                    name: frm.doc.custom_product_from_l1
                },
                callback: function (r) {
                    if (r.message && r.message.custom_packing_type) {
                        frm.packing_types = r.message.custom_packing_type
                            .map(d => d.packing_type)
                            .filter(Boolean);
                    }
                }
            });
        }

        setTimeout(() => {
            frm.remove_custom_button(__('Opportunity'), __('Create'));
            frm.remove_custom_button(__('Customer'), __('Create'));
            frm.remove_custom_button(__('Quotation'), __('Create'));
            frm.remove_custom_button(__('Prospect'), __('Create'));
            frm.remove_custom_button(__('L3-Prospect'), __('Create'));
            frm.remove_custom_button(__('Qualified Lead'), __('Create'));
            frm.remove_custom_button(__('Soft Inquiry'), __('Create'));
            frm.remove_custom_button(__('Make Variants'), __('Action'));



            frm.add_custom_button(__('Soft Inquiry'), () => {
                frm.events.make_opportunity_direct(frm);
            }, __('Create'));

            if (!frm.is_new() && frm.doc.custom_type_of_buyer && frm.doc.custom_l1_status == "Saved") {
                frm.add_custom_button(__('L3-Prospect'), () => {
                    frm.events.create_prospect_from_lead(frm, 'l3');
                }, __('Create'));
            }

            if (!frm.is_new() && frm.doc.custom_buyer_type && frm.doc.docstatus == 0) {
                frm.add_custom_button(__('Qualified Lead'), () => {
                    frm.events.create_prospect_from_lead(frm, 'qualified_lead');
                }, __('Create'));
            }

            if (get_variant_products(frm).length) {
                frm.add_custom_button(__('Make Variants'), () => {
                    make_variant_leads(frm);
                }, __('Action'));
            }
        }, 100);
    },

    create_prospect_from_lead: function (frm, prospect_type) {
        frappe.call({
            method: 'sukha.override.lead_override.create_prospect_from_lead',
            args: {
                lead_name: frm.doc.name,
                prospect_name: frm.doc.company_name || frm.doc.lead_name || frm.doc.name,
                prospect_type: prospect_type
            },
            freeze: true,
            freeze_message: __('Creating Prospect...'),
            callback: function (r) {

                if (!r.exc && r.message) {

                    frappe.show_alert({
                        message: __('L3/Qualified Created Successfully'),
                        indicator: 'green'
                    });

                    frappe.set_route('Form', 'Prospect', r.message);
                }
            }
        });

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
                primary_action: function (data) {
                    frappe.call({
                        method: "sukha.doc_events.prospect.create_prospect_and_contact",
                        args: {
                            docname: frm.doc.name,
                            data: data
                        },
                        freeze: true,
                        callback: function (r) {
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

frappe.ui.form.on("L1 Other Products", {
    product_name(frm) {
        render_lead_top_summary(frm);
    },
    volume_range(frm) {
        render_lead_top_summary(frm);
    },
    product_category(frm) {
        render_lead_top_summary(frm);
    },
    custom_other_products_add(frm) {
        render_lead_top_summary(frm);
    },
    custom_other_products_remove(frm) {
        render_lead_top_summary(frm);
    },
    custom_other_products_delete(frm) {
        render_lead_top_summary(frm);
    }
});

function lead_summary_value(value) {
    if (value === undefined || value === null || value === "") {
        return "-";
    }

    return frappe.utils.escape_html(value);
}


function get_lead_level_status(frm) {

    // Highest level always wins

    if (frm.doc.custom_l2_status === "Saved") {
        return "L2";
    }

    if (frm.doc.custom_l1_status === "Saved") {
        return "L1";
    }

    if (frm.doc.custom_l0_status === "Saved") {
        return "L0";
    }

    return "";
}

function get_lead_display_status(frm) {
    return [frm.doc.custom_buyer_type, get_lead_level_status(frm)]
        .filter(Boolean)
        .join(" - ");
}

function refresh_lead_status_display(frm) {
    render_lead_top_summary(frm);
    set_lead_page_indicator(frm);
}

function clear_lead_top_summary(frm) {
    if (!frm?.page?.body) {
        return;
    }

    $(frm.page.body).find("#lead-top-summary").remove();
}

function set_lead_page_indicator(frm) {
    if (!frm?.page) {
        return;
    }

    const display_status = get_lead_display_status(frm);

    if (!display_status) {
        setTimeout(() => {
            frm.page.clear_indicator();
        }, 0);
        return;
    }

    const color_status = get_lead_level_status(frm) || display_status;
    const color = frappe.utils.guess_colour(color_status);

    setTimeout(() => {
        frm.page.set_indicator(__(display_status), color);
    }, 0);
}

function get_variant_products(frm) {
    const main_products = [
        frm.doc.custom_product_name_m,
        frm.doc.custom_product
    ].filter(Boolean).map(product => product.trim());
    const products = [];

    (frm.doc.custom_other_products || []).forEach(row => {
        const product = (row.product_name || "").trim();

        if (product && !main_products.includes(product) && !products.includes(product)) {
            products.push(product);
        }
    });

    return products;
}

function render_lead_top_summary(frm) {
    if (!frm?.page?.body) {
        return;
    }

    const $body = $(frm.page.body);
    const variant_products = get_variant_products(frm);
    const other_products = (frm.doc.custom_other_products || []).filter(row => row.product_name);
    const product_name =
        frm.doc.custom_l1_product_name ||
        frm.doc.custom_product_name_m ||
        "-";

    const product_code =
        frm.doc.custom_product ||
        frm.doc.custom_product_name_i ||
        "-";

    const product_title = product_name;

    const product_subtitle = `
        Code: ${product_code}
        ${frm.doc.custom_product_category ? " | " + frm.doc.custom_product_category : ""}
    `;
    const display_status = get_lead_display_status(frm);

    const other_products_html = other_products.map(row => {
        const meta = [
            row.product_category,
            row.volume_range
        ].filter(Boolean).map(lead_summary_value).join(" | ");

        return `
            <div style="
                border:1px solid #e5e7eb;
                border-radius:8px;
                padding:8px 10px;
                background:#f8fafc;
                min-width:180px;
            ">
                <div style="font-size:13px;font-weight:600;color:#111827;">
                    ${lead_summary_value(row.product_name || frm.doc.custom_product_name_m)}
                </div>
                <div style="font-size:12px;color:#6b7280;margin-top:2px;">
                    ${meta || "No category or volume"}
                </div>
            </div>
        `;
    }).join("");

    const html = `
        <div id="lead-top-summary" style="
            background:#ffffff;
            border:1px solid #e5e7eb;
            border-radius:8px;
            padding:18px;
            margin-bottom:18px;
            box-shadow:0 1px 3px rgba(0,0,0,0.06);
        ">
            <div style="
                display:flex;
                justify-content:space-between;
                gap:12px;
                align-items:flex-start;
                margin-bottom:16px;
                flex-wrap:wrap;
            ">
                <div style="min-width:220px;">
                    <div style="font-size:20px;font-weight:700;color:#111827;">
                        ${lead_summary_value(product_title)}
                    </div>
                    <div style="color:#6b7280;margin-top:4px;font-size:13px;">
                        ${lead_summary_value(product_subtitle)}
                    </div>
                </div>

                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <span style="
                        background:#dcfce7;
                        color:#166534;
                        padding:6px 12px;
                        border-radius:999px;
                        font-size:13px;
                        font-weight:600;
                    ">
                        ${display_status ? lead_summary_value(display_status) : ""}
                    </span>
                </div>
            </div>

            <div style="
                display:grid;
                grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
                gap:14px;
            ">
               ${lead_summary_item(
        frm.doc.custom_sales_type === "Domestic / Merchant" ? "First Name" : "Company",
        frm.doc.custom_sales_type === "Domestic / Merchant"
            ? (frm.doc.first_name || frm.doc.custom_namee_of_the_company || "-")
            : (frm.doc.company_name || frm.doc.first_name || frm.doc.custom_namee_of_the_company || "-")
    )}
                ${lead_summary_item(
        "Product",
        `
                    <div>
                        <div>
                            <strong>Name:</strong>
                            ${frm.doc.custom_l1_product_name ||
        frm.doc.custom_product_name_m ||
        "-"
        }
                        </div>

                        <div style="margin-top:4px;">
                            <strong>Code:</strong>
                            ${frm.doc.custom_product ||
        frm.doc.custom_product_name_i ||
        "-"
        }
                        </div>
                    </div>
                    `
    )}
                ${lead_summary_item(
        frm.doc.custom_buyer_type
            ? "Buyer Type"
            : (
                frm.doc.custom_type_of_buyer
                    ? "Type of Buyer"
                    : "Buyer Type"
            ),

        frm.doc.custom_buyer_type
        || frm.doc.custom_type_of_buyer
        || "-"
    )}
                ${lead_summary_item("Country", frm.doc.custom_country_of_hq)}
                ${(() => {

            let volume_html = "-";

            if (
                frm.doc.custom_commercials__logistic &&
                frm.doc.custom_commercials__logistic.length
            ) {

                // volume_html = frm.doc.custom_commercials__logistic
                //     .filter(row => row.quantity_mtpa)
                //     .map(row => `
                //     <div style="margin-bottom:2px;">
                //          ${flt(row.quantity_mtpa || 0)} MTPA
                //     </div>
                // `)
                //     .join("");

                const total_mtpa = (frm.doc.custom_commercials__logistic || [])
                .reduce((sum, row) => {
                    return sum + flt(row.quantity_mtpa || 0);
                }, 0);
            
            volume_html = total_mtpa
                ? `${total_mtpa} MTPA`
                : "-";

                if (!volume_html) {
                    volume_html = "-";
                }

            } 
            else if (frm.doc.custom_volume_range) {

                volume_html = frm.doc.custom_volume_range;
            }

            return lead_summary_item(
                "Volume Range",
                volume_html
            );

        })()}
            </div>

            ${other_products.length ? `
                <div style="margin-top:18px;">
                    <div style="font-size:13px;color:#6b7280;margin-bottom:10px;font-weight:600;">
                        Other Products
                    </div>

                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        ${other_products_html}
                    </div>
                </div>
            ` : ""}
        </div>
    `;

    clear_lead_top_summary(frm);

    const $target = $body.find(".layout-main-section").first();
    ($target.length ? $target : $body).prepend(html);

}

function lead_summary_item(label, value) {
    return `
        <div>
            <div style="font-size:12px;color:#6b7280;">
                ${lead_summary_value(label)}
            </div>
            <div style="font-size:15px;font-weight:600;color:#111827;">
                ${value || "-"}
            </div>
        </div>
    `;
}

async function make_variant_leads(frm) {

    const variant_products = get_variant_products(frm);

    if (!variant_products.length) {
        return;
    }

    if (frm.is_new() || (frm.is_dirty && frm.is_dirty())) {
        await frm.save();
    }

    frappe.dom.freeze(__("Creating Variants..."));

    try {

        const created_leads = [];

        for (const product of variant_products) {

            const new_doc = frappe.model.copy_doc(frm.doc);

            delete new_doc.name;
            delete new_doc.creation;
            delete new_doc.modified;
            delete new_doc.modified_by;
            delete new_doc.owner;
            delete new_doc.docstatus;
            new_doc.custom_export_lead_status = "L0";
            new_doc.custom_l0_status = "";
            new_doc.custom_l1_status = "";
            new_doc.custom_l2_status = "";
            new_doc.custom_other_products = [];

            new_doc.custom_product = product;
            new_doc.custom_product_name = product;
            new_doc.custom_product_from_l1 = product;

            const inserted = await frappe.call({
                method: "frappe.client.insert",
                args: {
                    doc: new_doc
                }
            });

            if (inserted.message) {
                created_leads.push(inserted.message.name);
            }
        }

        if (created_leads.length) {

            frappe.show_alert({
                message: __("{0} Variant Leads Created", [created_leads.length]),
                indicator: "green"
            });

            frm.reload_doc();
        }

        return created_leads;

    } catch (e) {

        console.error(e);

        frappe.msgprint({
            title: __("Error"),
            indicator: "red",
            message: __("Failed to create variant leads")
        });

    } finally {

        frappe.dom.unfreeze();
    }
}
function set_port_filter(frm) {
    frm.set_query("custom_port_of_destination", function () {
        return {
            filters: {
                country: frm.doc.custom_country_of_destination
            }
        };
    });
}


async function proceed_l1_save(frm, variants) {

    if (!frm.doc.custom_volume_range) {
        frappe.throw(__("Volume Range is mandatory before saving L1"));
    }

    frm.set_value("custom_l1_status", "Saved");
    frm.set_value("custom_export_lead_status", "L1");

    await frm.save();

    if (variants && variants.length > 0) {

        frappe.show_alert({
            message: __("Creating Variant Leads..."),
            indicator: "blue"
        });

        let created_leads = await make_variant_leads(frm);
        frm.__variant_leads_created = true;
        frm.__created_variant_leads = created_leads || [];

        if (created_leads?.length) {

            frappe.msgprint({
                title: __("Variant Leads Created"),
                indicator: "green",
                message: `
                    <div style="line-height:1.8;">
                        ${created_leads.map(lead => `
                            <div>
                                <a href="/app/lead/${lead}" target="_blank">
                                    ${lead}
                                </a>
                            </div>
                        `).join("")}
                    </div>
                `
            });
        }
    }

    frappe.show_alert({
        message: __("L1 Saved Successfully"),
        indicator: "green"
    });
}

frappe.ui.form.on("Commercials & Logistic", {
    quantity_mtpa(frm) {
        render_lead_top_summary(frm);
    },
    custom_commercials__logistic_add(frm) {
        render_lead_top_summary(frm);
    },
    custom_commercials__logistic_remove(frm) {
        render_lead_top_summary(frm);
    }
});