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
        render_prospect_top_summary(frm);
        if (!frm.is_new()) {
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

function prospect_summary_item(label, value) {

    return `
        <div style="
            padding:12px;
            border:1px solid #f1f5f9;
            border-radius:10px;
            background:#ffffff;
        ">

            <div style="
                font-size:12px;
                color:#64748b;
                margin-bottom:6px;
                font-weight:500;
            ">
                ${label}
            </div>

            <div style="
                font-size:14px;
                font-weight:600;
                color:#111827;
                word-break:break-word;
            ">
                ${value || "-"}
            </div>

        </div>
    `;
}

async function render_prospect_top_summary(frm) {

    if (!frm?.page?.body || frm.is_new()) {
        return;
    }

    const $body = $(frm.page.body);

    $body.find("#prospect-top-summary").remove();

    let leads = [];
    let opportunities = [];

    // ==========================================
    // FETCH LEADS
    // ==========================================

    if (frm.doc.leads?.length) {

        for (let row of frm.doc.leads) {

            if (row.lead) {

                try {

                    let lead = await frappe.db.get_doc(
                        "Lead",
                        row.lead
                    );

                    leads.push(lead);

                } catch (e) {
                    // Silently skip if lead doesn't exist
                    console.warn(`Lead ${row.lead} not found or inaccessible`);
                }
            }
        }
    }

    // ==========================================
    // FETCH OPPORTUNITIES
    // ==========================================

    if (frm.doc.opportunities?.length) {

        for (let row of frm.doc.opportunities) {

            if (row.opportunity) {

                try {

                    let opp = await frappe.db.get_doc(
                        "Opportunity",
                        row.opportunity
                    );

                    opportunities.push(opp);

                } catch (e) {
                    // Silently skip if opportunity doesn't exist
                    console.warn(`Opportunity ${row.opportunity} not found or inaccessible`);
                }
            }
        }
    }

    // ==========================================
    // MAIN HTML
    // ==========================================

    const html = `

        <div id="prospect-top-summary" style="
            background:#ffffff;
            border:1px solid #e2e8f0;
            border-radius:16px;
            margin-bottom:20px;
            overflow:hidden;
        ">

            <!-- HEADER -->

            <div style="
                padding:20px;
                border-bottom:1px solid #e2e8f0;
                background:#f8fafc;
            ">

                <div style="
                    font-size:24px;
                    font-weight:700;
                    color:#111827;
                ">
                    ${frm.doc.company_name || frm.doc.name}
                </div>

                <div style="
                    margin-top:6px;
                    color:#64748b;
                    font-size:13px;
                ">
                    Prospect CRM Dashboard
                </div>

            </div>

            <!-- TABS -->

            <div style="
                display:flex;
                gap:10px;
                padding:18px 18px 0px 18px;
            ">

                <button class="btn btn-primary crm-main-tab"
                    data-tab="lead-tab-content">

                    Leads (${leads.length})

                </button>

                <button class="btn btn-default crm-main-tab"
                    data-tab="opp-tab-content">

                    Opportunities (${opportunities.length})

                </button>

            </div>

            <!-- LEAD TAB -->

            <div id="lead-tab-content"
                class="crm-tab-wrapper"
                style="
                    display:grid;
                    grid-template-columns:280px 1fr;
                    gap:0px;
                    margin-top:18px;
                ">

                <!-- LEFT -->

                <div style="
                    border-right:1px solid #e2e8f0;
                    background:#f8fafc;
                    max-height:850px;
                    overflow:auto;
                ">

                    ${leads.map((lead, index) => `

                        <div class="crm-lead-card"
                            data-name="${lead.name}"
                            style="
                                padding:16px;
                                border-bottom:1px solid #e2e8f0;
                                cursor:pointer;
                                background:${index === 0 ? '#dbeafe' : 'transparent'};
                            ">

                            <div style="
                                font-size:14px;
                                font-weight:700;
                            ">

                                <a href="/app/lead/${lead.name}"
                                    target="_blank"
                                    onclick="event.stopPropagation();"
                                    style="
                                        color:#111827;
                                        text-decoration:none;
                                    ">

                                    ${lead.lead_name || lead.name}

                                </a>

                            </div>

                            <div style="
                                font-size:12px;
                                color:#64748b;
                                margin-top:5px;
                            ">
                                ${lead.custom_product || lead.custom_product_name_m || "-"}
                            </div>

                            <div style="
                                margin-top:10px;
                            ">

                                <span style="
                                    background:#eff6ff;
                                    color:#2563eb;
                                    padding:4px 10px;
                                    border-radius:999px;
                                    font-size:11px;
                                    font-weight:600;
                                ">
                                    ${lead.status || "Lead"}
                                </span>

                            </div>

                        </div>

                    `).join("")}

                </div>

                <!-- RIGHT -->

                <div id="crm-lead-detail"
                    style="
                        padding:24px;
                        background:#ffffff;
                    ">
                </div>

            </div>

            <!-- OPPORTUNITY TAB -->

            <div id="opp-tab-content"
                class="crm-tab-wrapper"
                style="
                    display:none;
                    grid-template-columns:280px 1fr;
                    gap:0px;
                    margin-top:18px;
                ">

                <!-- LEFT -->

                <div style="
                    border-right:1px solid #e2e8f0;
                    background:#f8fafc;
                    max-height:850px;
                    overflow:auto;
                ">

                    ${opportunities.map((opp, index) => `

                        <div class="crm-opp-card"
                            data-name="${opp.name}"
                            style="
                                padding:16px;
                                border-bottom:1px solid #e2e8f0;
                                cursor:pointer;
                                background:${index === 0 ? '#dcfce7' : 'transparent'};
                            ">

                            <div style="
                                font-size:14px;
                                font-weight:700;
                            ">

                                <a href="/app/opportunity/${opp.name}"
                                    target="_blank"
                                    onclick="event.stopPropagation();"
                                    style="
                                        color:#111827;
                                        text-decoration:none;
                                    ">

                                    ${opp.name}

                                </a>

                            </div>

                            <div style="
                                font-size:12px;
                                color:#64748b;
                                margin-top:5px;
                            ">
                                ${opp.custom_product_name || "-"}
                            </div>

                            <div style="
                                margin-top:10px;
                            ">

                                <span style="
                                    background:#ecfdf5;
                                    color:#059669;
                                    padding:4px 10px;
                                    border-radius:999px;
                                    font-size:11px;
                                    font-weight:600;
                                ">
                                    ${opp.status || "Open"}
                                </span>

                            </div>

                        </div>

                    `).join("")}

                </div>

                <!-- RIGHT -->

                <div id="crm-opp-detail"
                    style="
                        padding:24px;
                        background:#ffffff;
                    ">
                </div>

            </div>

        </div>
    `;

    const $target = $body.find(".layout-main-section").first();

    ($target.length ? $target : $body).prepend(html);

    // ==========================================
    // LEAD DETAIL RENDER
    // ==========================================

    function renderLeadDetail(lead) {

        $("#crm-lead-detail").html(`

            <div>

                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:24px;
                    flex-wrap:wrap;
                    gap:10px;
                ">

                    <div>

                        <a href="/app/lead/${lead.name}"
                            target="_blank"
                            style="
                                font-size:26px;
                                font-weight:700;
                                color:#2563eb;
                                text-decoration:none;
                            ">

                            ${lead.lead_name || lead.name}

                        </a>

                        <div style="
                            color:#64748b;
                            margin-top:4px;
                        ">
                            ${lead.company_name ||
                              lead.custom_namee_of_the_company ||
                              "-"}
                        </div>

                    </div>

                    <span style="
                        background:#dbeafe;
                        color:#1d4ed8;
                        padding:8px 16px;
                        border-radius:999px;
                        font-size:13px;
                        font-weight:600;
                    ">
                        ${lead.status || "Lead"}
                    </span>

                </div>

                <div style="
                    display:grid;
                    grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
                    gap:16px;
                ">

                    ${lead.custom_sales_type === "Domestic / Merchant" ? `

                        ${prospect_summary_item("Company", lead.company_name)}
                        ${prospect_summary_item("Product", lead.custom_product_name_m)}

                        ${prospect_summary_item(
                            lead.custom_buyer_type
                                ? "Buyer Type"
                                : "Type of Buyer",

                            lead.custom_buyer_type ||
                            lead.custom_type_of_buyer
                        )}

                        ${prospect_summary_item("End Use", lead.custom_end_use)}
                        ${prospect_summary_item("Volume Range", lead.custom_volume_range)}
                        ${prospect_summary_item("Requirement", lead.custom_tentative_requirement_mtpa)}
                        ${prospect_summary_item("Country", lead.country)}
                        ${prospect_summary_item("State", lead.state)}
                        ${prospect_summary_item("City", lead.city)}
                        ${prospect_summary_item("Industry", lead.industry)}
                        ${prospect_summary_item("Website", lead.website)}
                        ${prospect_summary_item("Email", lead.email_id)}
                        ${prospect_summary_item("Phone", lead.phone || lead.mobile_no)}
                        ${prospect_summary_item("WhatsApp", lead.whatsapp_no)}
                        ${prospect_summary_item("Request Type", lead.request_type)}
                        ${prospect_summary_item("Lead Type", lead.custom_lead_type_s)}
                        ${prospect_summary_item("Sales Type", lead.custom_sales_type)}
                        ${prospect_summary_item("Status", lead.status)}

                    ` : `

                        ${prospect_summary_item("Organisation", lead.custom_organisations)}
                        ${prospect_summary_item("Bill To Party", lead.custom_bill_to_party_name)}
                        ${prospect_summary_item("Product", lead.custom_product)}
                        ${prospect_summary_item("Product Category", lead.custom_product_category)}

                        ${prospect_summary_item(
                            lead.custom_buyer_type
                                ? "Buyer Type"
                                : "Type of Buyer",

                            lead.custom_buyer_type ||
                            lead.custom_type_of_buyer
                        )}

                        ${prospect_summary_item("Industry", lead.custom_industry_type)}
                        ${prospect_summary_item("Sales Type", lead.custom_sales_type)}
                        ${prospect_summary_item("Volume Range", lead.custom_volume_range)}
                        ${prospect_summary_item("Volume Confirmation", lead.custom_volume_range_assumption)}
                        ${prospect_summary_item("Country of HQ", lead.custom_country_of_hq)}
                        ${prospect_summary_item("Contact Person", lead.custom_contact_person)}
                        ${prospect_summary_item("Designation", lead.custom_contact_person_designation__department)}
                        ${prospect_summary_item("Phone", lead.custom_contact_person_phone_number)}
                        ${prospect_summary_item("WhatsApp", lead.custom_contact_person_whatsapp_number)}
                        ${prospect_summary_item("Email", lead.custom_contact_person_email_id)}
                        ${prospect_summary_item("Board Number", lead.custom_board__number)}
                        ${prospect_summary_item("Preferred Communication", lead.custom_preferred_communication)}
                        ${prospect_summary_item("Source", lead.custom_source_of_the_lead)}
                        ${prospect_summary_item("Specific Source", lead.custom_specific_source)}
                        ${prospect_summary_item("Current Suppliers", lead.custom_current_suppliers)}
                        ${prospect_summary_item("Payment Terms", lead.custom_desired_payment_terms)}
                        ${prospect_summary_item("Desired Incoterm", lead.custom_desired_incoterm)}
                        ${prospect_summary_item("Central Email", lead.custom_central_email_id)}
                        ${prospect_summary_item("Lead Type", lead.custom_lead_type_s)}
                        ${prospect_summary_item("Status", lead.status)}

                    `}

                </div>

            </div>

        `);
    }

    // ==========================================
    // OPPORTUNITY DETAIL RENDER
    // ==========================================

    function renderOppDetail(opp) {

        $("#crm-opp-detail").html(`

            <div>

                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:24px;
                    flex-wrap:wrap;
                    gap:10px;
                ">

                    <div>

                        <a href="/app/opportunity/${opp.name}"
                            target="_blank"
                            style="
                                font-size:26px;
                                font-weight:700;
                                color:#16a34a;
                                text-decoration:none;
                            ">

                            ${opp.name}

                        </a>

                        <div style="
                            color:#64748b;
                            margin-top:4px;
                        ">
                            ${opp.customer_name || "-"}
                        </div>

                    </div>

                    <span style="
                        background:#dcfce7;
                        color:#166534;
                        padding:8px 16px;
                        border-radius:999px;
                        font-size:13px;
                        font-weight:600;
                    ">
                        ${opp.status || "Open"}
                    </span>

                </div>

                <div style="
                    display:grid;
                    grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
                    gap:16px;
                ">

                    ${opp.opportunity_type &&
                    opp.opportunity_type.includes("Domestic") ? `

                        ${prospect_summary_item("Customer", opp.customer_name)}
                        ${prospect_summary_item("Product", opp.custom_product_name)}

                        ${prospect_summary_item(
                            opp.custom_buyer_type
                                ? "Buyer Type"
                                : "Type of Buyer",

                            opp.custom_buyer_type ||
                            opp.custom_type_of_buyer
                        )}

                        ${prospect_summary_item("Industry", opp.industry)}
                        ${prospect_summary_item("Country", opp.country)}
                        ${prospect_summary_item("State", opp.state)}
                        ${prospect_summary_item("City", opp.city)}
                        ${prospect_summary_item("Website", opp.website)}
                        ${prospect_summary_item("Phone", opp.phone || opp.contact_mobile)}
                        ${prospect_summary_item("Email", opp.contact_email)}
                        ${prospect_summary_item("Inquiry Type", opp.custom_inquiry_type)}
                        ${prospect_summary_item("Inquiry Source", opp.custom_inquiry_source)}
                        ${prospect_summary_item("Specific Source", opp.custom_specific_inquiry_source)}
                        ${prospect_summary_item("Sales Stage", opp.sales_stage)}
                        ${prospect_summary_item("Opportunity Type", opp.opportunity_type)}
                        ${prospect_summary_item("Preferred Supplier", opp.custom_preferred_supplier)}
                        ${prospect_summary_item("Shipping Line", opp.custom_preferred_shipping_line)}
                        ${prospect_summary_item("Incoterm", opp.custom_incoterm)}
                        ${prospect_summary_item("Payment Terms", opp.custom_customer_desired_payment_terms)}
                        ${prospect_summary_item("Delivery Schedule", opp.custom_desired_delivery_schedule)}
                        ${prospect_summary_item("Palletization", opp.custom_palletization_required)}
                        ${prospect_summary_item("Remark", opp.custom_remark || opp.custom_remark_d)}
                        ${prospect_summary_item("Status", opp.status)}

                    ` : `

                        ${prospect_summary_item("Customer", opp.customer_name)}
                        ${prospect_summary_item("Product", opp.custom_product_name)}

                        ${prospect_summary_item(
                            opp.custom_buyer_type
                                ? "Buyer Type"
                                : "Type of Buyer",

                            opp.custom_buyer_type ||
                            opp.custom_type_of_buyer
                        )}

                        ${prospect_summary_item("Product Grade", opp.custom_product_grade)}
                        ${prospect_summary_item("Country", opp.country)}
                        ${prospect_summary_item("Destination Country", opp.custom_country_of__destination__ship_to_destination)}
                        ${prospect_summary_item("Inquiry Type", opp.custom_inquiry_type)}
                        ${prospect_summary_item("Inquiry Source", opp.custom_inquiry_source)}
                        ${prospect_summary_item("Specific Source", opp.custom_specific_inquiry_source)}
                        ${prospect_summary_item("Sales Stage", opp.sales_stage)}
                        ${prospect_summary_item("Opportunity Type", opp.opportunity_type)}
                        ${prospect_summary_item("Preferred Supplier", opp.custom_preferred_supplier)}
                        ${prospect_summary_item("Shipping Line", opp.custom_preferred_shipping_line)}
                        ${prospect_summary_item("Incoterm", opp.custom_incoterm)}
                        ${prospect_summary_item("Payment Terms", opp.custom_customer_desired_payment_terms)}
                        ${prospect_summary_item("Delivery Schedule", opp.custom_desired_delivery_schedule)}
                        ${prospect_summary_item("Contact Person", opp.custom_contact_person)}
                        ${prospect_summary_item("Contact Details", opp.custom_contact_details)}
                        ${prospect_summary_item("Product Owner", opp.custom_product_owner)}
                        ${prospect_summary_item("Palletization", opp.custom_palletization_required)}
                        ${prospect_summary_item("Container Type", opp.custom_container_type)}
                        ${prospect_summary_item("Remark", opp.custom_remark)}
                        ${prospect_summary_item("Status", opp.status)}

                    `}

                </div>

            </div>

        `);
    }

    // ==========================================
    // DEFAULT LOAD
    // ==========================================

    if (leads.length) {
        renderLeadDetail(leads[0]);
    }

    if (opportunities.length) {
        renderOppDetail(opportunities[0]);
    }

    // ==========================================
    // LEAD SWITCH
    // ==========================================

    $("#prospect-top-summary .crm-lead-card").on("click", function() {

        let name = $(this).data("name");

        let lead = leads.find(d => d.name === name);

        if (lead) {
            renderLeadDetail(lead);
        }

        $(".crm-lead-card").css("background", "transparent");

        $(this).css("background", "#dbeafe");

    });

    // ==========================================
    // OPP SWITCH
    // ==========================================

    $("#prospect-top-summary .crm-opp-card").on("click", function() {

        let name = $(this).data("name");

        let opp = opportunities.find(d => d.name === name);

        if (opp) {
            renderOppDetail(opp);
        }

        $(".crm-opp-card").css("background", "transparent");

        $(this).css("background", "#dcfce7");

    });

    // ==========================================
    // MAIN TAB SWITCH
    // ==========================================

    $("#prospect-top-summary .crm-main-tab").on("click", function() {

        let tab = $(this).data("tab");

        $(".crm-main-tab")
            .removeClass("btn-primary")
            .addClass("btn-default");

        $(this)
            .removeClass("btn-default")
            .addClass("btn-primary");

        $("#prospect-top-summary .crm-tab-wrapper")
            .hide();

        $("#" + tab).css("display", "grid");

    });

}