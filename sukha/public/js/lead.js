frappe.ui.form.on('Lead', {
    before_load: function (frm) {
        clear_lead_top_summary(frm);
    },
    onload: function (frm) {
        clear_lead_top_summary(frm);
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
                            // frm.set_df_property("custom_domestic_merchant_button", "hidden", 0);
                        }
                        frm.trigger("custom_sales_type");

                        if (values.sales_type === "Direct Export Sales") {

                            // frm.events.show_direct_export_quick_entry_dialog(frm);
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
        try {
            await frm.set_value(
                "custom_l0_status",
                "Saved"
            );
            frm.set_value("custom_export_lead_status", "L0")

            frm.ignore_permission_validation = true;
            await frm.save();
            frappe.show_alert({
                message: __("L0 Saved Successfully"),
                indicator: "green"
            });

        } catch (e) {

            console.error(e);

            frappe.msgprint({
                title: __("Error"),
                message: __("Failed to Save L0"),
                indicator: "red"
            });

        } 
    },
    custom_save_l1: async function (frm) {
        if (frm.doc.custom_l0_status !== "Saved") {
            frappe.msgprint({
                title: "Validation",
                message: "Please save L0 details first.",
                indicator: "red"
            });
            return;
        }
           frm.set_value("custom_l1_status", "Saved");
        frm.set_value("custom_export_lead_status", "L1");
        await frm.save();
        let variants = get_variant_products(frm);
        if (variants && variants.length > 0) {

            frappe.show_alert({
                message: __("Creating Variant Leads..."),
                indicator: "blue"
            });

            await make_variant_leads(frm);
        }

        frappe.show_alert({
            message: __("L1 Saved Successfully"),
            indicator: "green"
        });
    },
    custom_create_contact(frm) {
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
            secondary_action: function () {
                dialog.hide();
            }
        });

        dialog.show();
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
        // ONLY FOR DIRECT EXPORT SALES
        if (frm.doc.custom_sales_type === "Direct Export Sales") {
            setTimeout(() => {
                if (frm.layout && frm.layout.refresh) {
                    frm.layout.refresh();
                }
                $(".form-section .section-head.collapsed").each(function () {
                    $(this).trigger("click");
                });

                $(".form-dashboard-section .collapsed").each(function () {
                    $(this).trigger("click");
                });

                if (frm.layout && frm.layout.select_tab) {
                    frm.layout.select_tab(
                        "custom_l0marketing_research"
                    );
                }
            }, 200);
        }
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
        frm.set_value("custom_product_from_l1", frm.doc.custom_product_name)
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
        frm.set_value('custom_contact_person_for_soft_inquiry', frm.doc.custom_contact_person)

        if (!frm.doc.custom_contact_person) {
            return;
        }

        try {

            let contact = await frappe.db.get_doc(
                "Contact",
                frm.doc.custom_contact_person
            );

            // PHONE
            if (contact.phone) {

                frm.set_value(
                    "custom_contact_person_phone_number",
                    contact.phone
                );
            }

            // MOBILE
            else if (contact.mobile_no) {

                frm.set_value(
                    "custom_contact_person_phone_number",
                    contact.mobile_no
                );
            }

            // EMAIL
            if (contact.email_id) {

                frm.set_value(
                    "custom_contact_person_phone_email_id",
                    contact.email_id
                );
            }

            // DESIGNATION
            if (contact.designation) {

                frm.set_value(
                    "custom_contact_person_designation__department",
                    contact.designation
                );
            }

            // VISITING CARD
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


    // Keep your existing functions below
    custom_same_as_phone: function (frm) {
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

        setTimeout(() => {
            frm.remove_custom_button(__('Opportunity'), __('Create'));
            frm.remove_custom_button(__('Customer'), __('Create'));
            frm.remove_custom_button(__('Quotation'), __('Create'));
            frm.remove_custom_button(__('Prospect'), __('Create'));
            frm.remove_custom_button(__('Soft Inquiry'), __('Create'));
            frm.remove_custom_button(__('Make Variants'), __('Action'));

            frm.add_custom_button(__('Opportunity'), () => {
                frm.events.make_opportunity_direct(frm);
            }, __('Create'));

            frm.add_custom_button(__('Soft Inquiry'), () => {
                frm.events.make_opportunity_direct(frm);
            }, __('Create'));

            if (get_variant_products(frm).length) {
                frm.add_custom_button(__('Make Variants'), () => {
                    make_variant_leads(frm);
                }, __('Action'));
            }
        }, 100);
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
    if (frm.doc.custom_export_lead_status) {
        return frm.doc.custom_export_lead_status;
    }

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
    return get_lead_level_status(frm);
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
    const product_title = frm.doc.custom_product_name_m || frm.doc.custom_product;
    const product_subtitle = [
        frm.doc.custom_product_name_m ? frm.doc.custom_product : null,
        frm.doc.custom_product_category
    ].filter(Boolean).join(" | ");
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

    // const action_html = variant_products.length ? `
    //     <button type="button" class="btn btn-sm btn-primary lead-make-variants">
    //         ${__("Make Variants")}
    //     </button>
    // ` : "";

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
                ${lead_summary_item("Company", frm.doc.first_name || frm.doc.custom_namee_of_the_company || frm.doc.company_name)}
                ${lead_summary_item("Product", frm.doc.custom_product || frm.doc.custom_product_name_m)}
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
                ${lead_summary_item("Volume Range", frm.doc.custom_volume_range)}
            </div>

            <div style="margin-top:18px;">
                <div style="font-size:13px;color:#6b7280;margin-bottom:10px;font-weight:600;">
                    Other Products
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${other_products_html || `<span style="color:#9ca3af;">${__("No Other Products")}</span>`}
                </div>
            </div>
        </div>
    `;

    clear_lead_top_summary(frm);

    const $target = $body.find(".layout-main-section").first();
    ($target.length ? $target : $body).prepend(html);

    // $body.find("#lead-top-summary .lead-make-variants").on("click", () => {
    //     make_variant_leads(frm);
    // });
}

function lead_summary_item(label, value) {
    return `
        <div>
            <div style="font-size:12px;color:#6b7280;">
                ${lead_summary_value(label)}
            </div>
            <div style="font-size:15px;font-weight:600;color:#111827;">
                ${lead_summary_value(value)}
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


            // RESET CHILD TABLE
            new_doc.custom_other_products = [];

            // SET PRODUCT
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
