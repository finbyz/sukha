frappe.ui.form.on('Prospect', {
    custom_product_name(frm) {
        frm.clear_table("custom_techno_approval");
        if (frm.doc.custom_product_name) {
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item",
                    name: frm.doc.custom_product_name
                },
                callback: function(r) {
                    if (r.message) {
                        // Store packing types for filter
                        frm.packing_types = r.message.custom_packing_type
                            .map(d => d.packing_type)
                            .filter(Boolean);
                        frm.refresh_field("custom_techno_approval");
                    }
                }
            });
        }
    },
    before_workflow_action: function (frm) {
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
                primary_action: function (values) {
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
                secondary_action: function () {
                    dialog.hide();
                    frm.selected_workflow_action = null;
                    frappe.dom.unfreeze();
                    reject();
                }
            });

            dialog.show();
        });
    },
    custom_industry_segment(frm) {
        frm.set_value("industry", frm.doc.custom_industry_segment);
    },
    custom_product: function (frm) {
        frm.set_value("custom_prroduct_p", frm.doc.custom_product);
    },
    refresh: function (frm) {
        render_prospect_top_summary(frm);
        sales_type_pop(frm);
        if (!frm.is_new()) {
            if (frm.doc.leads && frm.doc.leads.length > 0) {
                frm.add_custom_button(__('View Leads ({0})', [frm.doc.leads.length]), function () {
                    frappe.route_options = {
                        "name": ["in", frm.doc.leads.map(l => l.lead)]
                    };
                    frappe.set_route("List", "Lead");
                }, __('View'));
            }
        }

        frm.set_query("approved_packing", "custom_techno_approval", function (doc, cdt, cdn) {
            let packing_types = frm.packing_types || [];
            return {
                filters: {
                    name: ["in", packing_types.length > 0 ? packing_types : ["__NO_VALUE__"]]
                }
            };
        });

        if (frm.doc.custom_product_name && !frm.packing_types) {
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Item",
                    name: frm.doc.custom_product_name
                },
                callback: function(r) {
                    if (r.message && r.message.custom_packing_type) {
                        frm.packing_types = r.message.custom_packing_type
                            .map(d => d.packing_type)
                            .filter(Boolean);
                    }
                }
            });
        }
    },

    onload: function (frm) {
        if (frm.is_new() && frm.doc.leads && frm.doc.leads.length > 0) {
            let lead_name = frm.doc.leads[0].lead;

            if (lead_name) {
                frappe.call({
                    method: "frappe.client.get",
                    args: {
                        doctype: "Lead",
                        name: lead_name
                    },
                    callback: function (r) {
                        if (r.message) {
                            let lead = r.message;

                            if (lead.custom_contact_person) frm.set_value("custom_contact_person", lead.custom_contact_person);
                            if (lead.custom_contact_person_email_id) frm.set_value("custom_contact_person_email_id", lead.custom_contact_person_email_id);
                            if (lead.custom_contact_person_whatsapp_number) frm.set_value("custom_contact_person_whatsapp_number", lead.custom_contact_person_whatsapp_number);
                            if (lead.custom_country_of_destination) frm.set_value("custom_country_of_destination", lead.custom_country_of_destination);
                            if (lead.custom_port_of_destination) frm.set_value("custom_port_of_destination", lead.custom_port_of_destination);
                            if (lead.custom_product_name) frm.set_value("custom_product", lead.custom_product_name);
                            if (lead.custom_sales_type) frm.set_value("custom_sales_type", lead.custom_sales_type);
                            if (lead.custom_volume_range) frm.set_value("custom_volume_range", lead.custom_volume_range);
                            if (lead.custom_source_of_the_lead) frm.set_value("custom_source_of_the_lead", lead.custom_source_of_the_lead);
                        }
                    }
                });
            }
        }
    }
});
function prospect_summary_item(label, value) {
    if (value === null || value === undefined || value === "" || value === 0 || value === false) return "";
    return `
        <div style="
            padding:12px;
            border:1px solid var(--border-color);
            border-radius:10px;
            background:var(--bg-white);
        ">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500;text-transform:uppercase;letter-spacing:0.4px;">
                ${label}
            </div>
            <div style="font-size:13px;color:var(--text-on-surface);word-break:break-word;">
                ${value}
            </div>
        </div>
    `;
}

let _summary_active_lead = null;
let _summary_active_tab = "l0";
let _summary_render_fn = null;
let _summary_debounce = null;

function _sync_summary_field(fieldname, value) {
    if (!_summary_active_lead || !_summary_render_fn) return;
    _summary_active_lead[fieldname] = value;
    clearTimeout(_summary_debounce);
    _summary_debounce = setTimeout(() => {
        _summary_render_fn(_summary_active_lead, _summary_active_tab);
    }, 150);
}

const _lead_sync_fields = [
    // Domestic fields
    "lead_name", "first_name", "middle_name", "last_name", "job_title", "gender",
    "request_type", "type", "lead_owner", "status", "custom_export_lead_status",
    "customer", "custom_product_name_m", "custom_buyer_type",
    "custom_tentative_requirement_mtpa", "custom_end_use", "email_id", "website",
    "mobile_no", "whatsapp_no", "city", "country", "state", "territory", "company_name",
    "no_of_employees", "annual_revenue", "industry", "market_segment", "phone",
    "phone_ext", "utm_source", "utm_medium", "utm_campaign", "utm_content",
    "qualification_status", "qualified_by", "qualified_on", "fax", "company",
    "language", "title", "disabled", "unsubscribed", "blog_subscriber",
    // Export L0 fields
    "custom_organisations", "custom_first_name_s", "custom_country_of_hq",
    "custom_board__number", "custom_1", "custom_2",
    "custom_central_email_id", "custom_type_of_buyer", "custom_lead_type_s",
    "custom_approx_revenue_in_mil_us", "custom_employee_size_on_linkedin",
    "custom_industry_type", "custom_specify_industry", "custom_source_of_the_lead",
    "custom_specific_source", "custom_other_source", "custom_notes__a", "custom_l0_status",
    // Export L1 fields
    "custom_product", "custom_volume_range", "custom_specific_range", "custom_l1_status",
    "custom_product_category", "custom_volume_range_assumption", "custom_contact_person",
    "custom_contact_person_phone_number", "custom_contact_person_phone_email_id",
    "custom_contact_person_contracted_via", "custom_specify_contracted_via",
    "custom_contact_person_designation__department", "custom_contact_person_whatsapp_number",
    "custom_bill_to_party_name", "custom_bill_to_party_country", "custom_bill_to_party_address",
    "custom_remarks",
    // Export L2 fields
    "custom_product_from_l1", "custom_l2_status", "custom_desired_payment_terms",
    "custom_current_suppliers", "custom_desired_incoterm",
    "custom_contact_person_for_soft_inquiry", "custom_contact_person_email_id",
    "custom_decision_role", "custom_designation", "custom_contact_number",
    "custom_preferred_communication"
];

(function () {
    const handlers = {};
    _lead_sync_fields.forEach(function (f) {
        handlers[f] = function (frm) {
            _sync_summary_field(f, frm.doc[f]);
        };
    });
    frappe.ui.form.on("Lead", handlers);
})();


async function render_prospect_top_summary(frm) {

    if (!frm?.page?.body || frm.is_new()) return;

    const $body = $(frm.page.body);
    $body.find("#prospect-top-summary").remove();

    let leads = [];

    if (frm.doc.leads?.length) {
        for (let row of frm.doc.leads) {
            if (row.lead) {
                try {
                    let lead = await frappe.db.get_doc("Lead", row.lead);
                    leads.push(lead);
                } catch (e) {
                    console.warn(`Lead ${row.lead} not found or inaccessible`);
                }
            }
        }
    }

    // ── Shell HTML ────────────────────────────────────────────────
    const html = `
        <div id="prospect-top-summary" style="
            background:#ffffff;
            border:1px solid var(--border-color);
            border-radius:16px;
            margin-bottom:20px;
            overflow:hidden;
        ">
            <!-- HEADER -->
            <div style="padding:20px;border-bottom:1px solid #e2e8f0;background:var(--subtle-fg);">
                <div style="font-size:22px;font-weight:700;color:#111827;">
                    ${frm.doc.company_name || frm.doc.name}
                </div>
                <div style="margin-top:4px;color:var(--text-muted);font-size:13px;">Prospect CRM Dashboard</div>
            </div>

            <!-- LEAD DETAIL AREA -->
            <div id="crm-lead-detail" style="padding:24px;background:#ffffff;"></div>
        </div>
    `;

    const $target = $body.find(".layout-main-section").first();
    ($target.length ? $target : $body).prepend(html);

    // ── Render detail — branches on buyer_type vs type_of_buyer ──
    function renderLeadDetail(lead, activeTab) {
        activeTab = activeTab || "l0";
        // Expose to live-sync globals
        _summary_active_lead = lead;
        _summary_render_fn = renderLeadDetail;


        if (lead.custom_buyer_type) {

            const domesticFields = `
                ${prospect_summary_item("Full Name", lead.lead_name)}
                ${prospect_summary_item("First Name", lead.first_name)}
                ${prospect_summary_item("Middle Name", lead.middle_name)}
                ${prospect_summary_item("Last Name", lead.last_name)}
                ${prospect_summary_item("Job Title", lead.job_title)}
                ${prospect_summary_item("Gender", lead.gender)}
                ${prospect_summary_item("Request Type", lead.request_type)}
                ${prospect_summary_item("Lead Type", lead.type)}
                ${prospect_summary_item("Lead Owner", lead.lead_owner)}
                ${prospect_summary_item("Status", lead.custom_export_lead_status || lead.status)}
                ${prospect_summary_item("From Customer", lead.customer)}
                ${prospect_summary_item("Product Name", lead.custom_product_name_m)}
                ${prospect_summary_item("Buyer Type", lead.custom_buyer_type)}
                ${prospect_summary_item("Tentative Requirement (MTPA)", lead.custom_tentative_requirement_mtpa)}
                ${prospect_summary_item("End Use", lead.custom_end_use)}
                ${prospect_summary_item("Email", lead.email_id)}
                ${prospect_summary_item("Website", lead.website)}
                ${prospect_summary_item("Mobile No", lead.mobile_no)}
                ${prospect_summary_item("WhatsApp", lead.whatsapp_no)}
                ${prospect_summary_item("City", lead.city)}
                ${prospect_summary_item("Country", lead.country)}
                ${prospect_summary_item("State / Province", lead.state)}
                ${prospect_summary_item("Territory", lead.territory)}
                ${prospect_summary_item("Organisation Name", lead.company_name)}
                ${prospect_summary_item("No of Employees", lead.no_of_employees)}
                ${prospect_summary_item("Annual Revenue", lead.annual_revenue)}
                ${prospect_summary_item("Industry", lead.industry)}
                ${prospect_summary_item("Market Segment", lead.market_segment)}
                ${prospect_summary_item("Phone", lead.phone)}
                ${prospect_summary_item("Phone Ext.", lead.phone_ext)}
                ${prospect_summary_item("Lead Source", lead.utm_source)}
                ${prospect_summary_item("Medium", lead.utm_medium)}
                ${prospect_summary_item("Campaign", lead.utm_campaign)}
                ${prospect_summary_item("Content", lead.utm_content)}
                ${prospect_summary_item("Qualified By", lead.qualified_by)}
                ${prospect_summary_item("Qualified On", lead.qualified_on)}
                ${prospect_summary_item("Fax", lead.fax)}
                ${prospect_summary_item("Company", lead.company)}
                ${prospect_summary_item("Title", lead.title)}
                ${prospect_summary_item("Disabled", lead.disabled ? "Yes" : null)}
                ${prospect_summary_item("Unsubscribed", lead.unsubscribed ? "Yes" : null)}
                ${prospect_summary_item("Blog Subscriber", lead.blog_subscriber ? "Yes" : null)}
            `;

            $("#crm-lead-detail").html(`
                <div>
                    <!-- Header row -->
                    <div style="
                        display:flex;justify-content:space-between;align-items:center;
                        margin-bottom:20px;flex-wrap:wrap;gap:10px;
                    ">
                        <div>
                            <a href="/app/lead/${lead.name}" target="_blank" style="
                                font-size:15px;color:var(--primary);text-decoration:none;font-weight:bold;
                            ">${lead.name}</a>
                            <div style="color:var(--text-muted);margin-top:3px;font-size:13px;font-weight:bold;">
                                ${lead.company_name || ""}
                            </div>
                        </div>
                        <span style="
                            background:var(--success-bg);
                            color:var(--success);
                            padding:6px 14px;border-radius:999px;
                            font-size:12px;font-weight:600;
                        ">Domestic</span>
                    </div>

                    <!-- Flat field grid -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                        ${domesticFields}
                    </div>
                </div>
            `);

            return;
        }


        const l0Fields = `
            ${prospect_summary_item("Organisation", lead.custom_organisations)}
            ${prospect_summary_item("Name of Company", lead.custom_first_name_s)}
            ${prospect_summary_item("Country of HQ", lead.custom_country_of_hq)}
            ${prospect_summary_item("Board Number", lead.custom_board__number)}
            ${lead.custom_1 ? `
                <div style="
                    padding:12px;
                    border:1px solid var(--border-color);
                    border-radius:10px;
                    background:var(--bg-white);
                ">
                    <div style="
                        font-size:11px;
                        color:var(--text-muted);
                        margin-bottom:4px;
                        font-weight:500;
                        text-transform:uppercase;
                        letter-spacing:0.4px;
                    ">
                        Website
                    </div>

                    <div style="font-size:13px;">
                        <a href="${lead.custom_1.startsWith('http') ? lead.custom_1 : 'https://' + lead.custom_1}"
                            target="_blank"
                            style="
                                color:var(--primary);
                                text-decoration:none;
                                font-weight:600;
                                display:block;
                                overflow:hidden;
                                text-overflow:ellipsis;
                                white-space:nowrap;
                            ">
                            ${lead.custom_1}
                        </a>
                    </div>
                </div>
                ` : ""}
            ${lead.custom_2 ? `
                <div style="
                    padding:12px;
                    border:1px solid var(--border-color);
                    border-radius:10px;
                    background:var(--bg-white);
                ">
                    <div style="
                        font-size:11px;
                        color:var(--text-muted);
                        margin-bottom:4px;
                        font-weight:500;
                        text-transform:uppercase;
                        letter-spacing:0.4px;
                    ">
                        LinkedIn
                    </div>

                    <div style="font-size:13px;">
                        <a href="${lead.custom_2.startsWith('http') ? lead.custom_2 : 'https://' + lead.custom_2}"
                            target="_blank"
                            style="
                                color:var(--primary);
                                text-decoration:none;
                                font-weight:600;
                                display:block;
                                overflow:hidden;
                                text-overflow:ellipsis;
                                white-space:nowrap;
                            ">
                            ${lead.custom_2}
                        </a>
                    </div>
                </div>
                ` : ""}
            ${prospect_summary_item("Central Email ID", lead.custom_central_email_id)}
            ${prospect_summary_item("Type of Buyer", lead.custom_type_of_buyer)}
            ${prospect_summary_item("Lead Type", lead.custom_lead_type_s)}
            ${prospect_summary_item("Approx Revenue (Mil US$)", lead.custom_approx_revenue_in_mil_us)}
            ${prospect_summary_item("Employee Size (LinkedIn)", lead.custom_employee_size_on_linkedin)}
            ${prospect_summary_item("Industry Type", lead.custom_industry_type)}
            ${prospect_summary_item("Specify Industry", lead.custom_specify_industry)}
            ${prospect_summary_item("Source of Lead", lead.custom_source_of_the_lead)}
            ${prospect_summary_item("Specific Source", lead.custom_specific_source)}
            ${prospect_summary_item("Other Source", lead.custom_other_source)}
            ${prospect_summary_item("Notes", lead.custom_notes__a)}
        `;

        // ── L1 fields ────────────────────────────────────────────
        const l1Fields = `
            ${prospect_summary_item("Product Name", lead.custom_product)}
            ${prospect_summary_item("Volume Range", lead.custom_volume_range)}
            ${prospect_summary_item("Specific Volume Range", lead.custom_specific_range)}
            ${prospect_summary_item("Product Category", lead.custom_product_category)}
            ${prospect_summary_item("Volume Range Assumption", lead.custom_volume_range_assumption)}
            ${prospect_summary_item("Contact Person", lead.custom_contact_person)}
            ${prospect_summary_item("Contact Person Phone", lead.custom_contact_person_phone_number)}
            ${prospect_summary_item("Contact Person Email", lead.custom_contact_person_phone_email_id)}
            ${prospect_summary_item("Contracted Via", lead.custom_contact_person_contracted_via)}
            ${prospect_summary_item("Specify Contracted Via", lead.custom_specify_contracted_via)}
            ${prospect_summary_item("Designation / Department", lead.custom_contact_person_designation__department)}
            ${prospect_summary_item("WhatsApp", lead.custom_contact_person_whatsapp_number)}
            ${prospect_summary_item("Bill To Party Name", lead.custom_bill_to_party_name)}
            ${prospect_summary_item("Bill To Party Country", lead.custom_bill_to_party_country)}
            ${prospect_summary_item("Bill To Party Address", lead.custom_bill_to_party_address)}
            ${prospect_summary_item("Remarks", lead.custom_remarks)}
        `;

        // ── L2 fields ────────────────────────────────────────────
        const l2Fields = `
            ${prospect_summary_item("Product Name", lead.custom_product_from_l1)}
            ${prospect_summary_item("Desired Payment Terms", lead.custom_desired_payment_terms)}
            ${prospect_summary_item("Current Suppliers", lead.custom_current_suppliers)}
            ${prospect_summary_item("Desired Inco-Term", lead.custom_desired_incoterm)}
            ${prospect_summary_item("Contact Person (Soft Inquiry)", lead.custom_contact_person_for_soft_inquiry)}
            ${prospect_summary_item("Contact Email ID", lead.custom_contact_person_email_id)}
            ${prospect_summary_item("Decision Role", lead.custom_decision_role)}
            ${prospect_summary_item("Designation", lead.custom_designation)}
            ${prospect_summary_item("Contact Number", lead.custom_contact_number)}
            ${prospect_summary_item("Preferred Communication", lead.custom_preferred_communication)}
        `;

        $("#crm-lead-detail").html(`
            <div>
                <!-- Header row -->
                <div style="
                    display:flex;justify-content:space-between;align-items:center;
                    margin-bottom:20px;flex-wrap:wrap;gap:10px;
                ">
                    <div>
                        <a href="/app/lead/${lead.name}" target="_blank" style="
                            font-size:15px;color:var(--primary);text-decoration:none;
                        ">${lead.name}</a>
                        <div style="color:var(--text-muted);margin-top:3px;font-size:13px;">
                            ${lead.custom_first_name_s || lead.company_name || ""}
                        </div>
                    </div>
                    <span style="
                        background:#dbeafe;color:#1d4ed8;
                        padding:6px 14px;border-radius:999px;
                        font-size:12px;font-weight:600;
                    ">
                        ${lead.custom_export_lead_status || lead.status || "Lead"}
                    </span>
                </div>

                <!-- L0 / L1 / L2 sub-tab buttons -->
                <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid #e2e8f0;">
                    <button class="lead-section-tab btn btn-sm" data-section="l0" style="
                        padding:7px 20px;border-radius:8px 8px 0 0;border:1px solid var(--border-color);
                        border-bottom:none;background:var(--primary);color:var(--white);font-weight:600;
                        cursor:pointer;font-size:13px;
                    ">L0</button>
                    <button class="lead-section-tab btn btn-sm" data-section="l1" style="
                        padding:7px 20px;border-radius:8px 8px 0 0;border:1px solid var(--border-color);
                        border-bottom:none;background:var(--subtle-fg);color:var(--text);font-weight:600;
                        cursor:pointer;font-size:13px;
                    ">L1</button>
                    <button class="lead-section-tab btn btn-sm" data-section="l2" style="
                        padding:7px 20px;border-radius:8px 8px 0 0;border:1px solid var(--border-color);
                        border-bottom:none;background:var(--subtle-fg);color:var(--text);font-weight:600;
                        cursor:pointer;font-size:13px;
                    ">L2</button>
                </div>

                <!-- Section panels -->
                <div class="lead-section-panel" id="panel-l0" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                    ${l0Fields}
                </div>
                <div class="lead-section-panel" id="panel-l1" style="display:none;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                    ${l1Fields}
                </div>
                <div class="lead-section-panel" id="panel-l2" style="display:none;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                    ${l2Fields}
                </div>
            </div>
        `);

        $("#crm-lead-detail").off("click", ".lead-section-tab").on("click", ".lead-section-tab", function () {
            const section = $(this).data("section");
            $("#crm-lead-detail .lead-section-tab").css({ background: "var(--subtle-fg)", color: "var(--text)" });
            $(this).css({ background: "var(--primary)", color: "var(--white)    " });
            $(".lead-section-panel").hide();
            $("#panel-" + section).css("display", "grid");
        });

        if (activeTab !== "l0") {
            $("#crm-lead-detail .lead-section-tab[data-section='" + activeTab + "']")
                .css({ background: "var(--primary)", color: "var(--white)" });
            $("#crm-lead-detail .lead-section-tab[data-section='l0']")
                .css({ background: "var(--subtle-fg)", color: "var(--text)" });
            $(".lead-section-panel").hide();
            $("#panel-" + activeTab).css("display", "grid");
        }
    }

    _summary_active_tab = "l0";
    if (leads.length) {
        renderLeadDetail(leads[0], "l0");
    }
}


function sales_type_pop(frm) {
    if (!frm.is_new() || frm.sales_type_dialog_shown) {
        return;
    }

    frm.sales_type_dialog_shown = true;

    let dialog = new frappe.ui.Dialog({
        title: __("Select Sales Type"),
        fields: [
            {
                fieldname: "sales_type",
                label: __("Sales Type"),
                fieldtype: "Select",
                options: [
                    "",
                    "Domestic / Merchant",
                    "Direct Export Sales"
                ],
                reqd: 1,
                onchange: function () {

                    let sales_type = dialog.get_value("sales_type");

                    // Show Buyer Type for Domestic
                    if (sales_type === "Domestic / Merchant") {

                        dialog.set_df_property("buyer_type", "hidden", 0);
                        dialog.set_df_property("type_of_buyer", "hidden", 1);

                    } else if (sales_type === "Direct Export Sales") {

                        dialog.set_df_property("buyer_type", "hidden", 1);
                        dialog.set_df_property("type_of_buyer", "hidden", 0);

                    } else {

                        dialog.set_df_property("buyer_type", "hidden", 1);
                        dialog.set_df_property("type_of_buyer", "hidden", 1);
                    }
                }
            },

            // Domestic / Merchant
            {
                fieldname: "buyer_type",
                label: __("Buyer Type"),
                fieldtype: "Select",
                options: [
                    "",
                    "Domestic",
                    "Merchant"
                ],
                hidden: 1
            },

            // Direct Export Sales
            {
                fieldname: "type_of_buyer",
                label: __("Type of Buyer"),
                fieldtype: "Select",
                options: [
                    "",
                    "End User",
                    "Trader",
                    "Stockist / Distributor",
                    "Agent"
                ],
                hidden: 1
            }
        ],

        primary_action_label: __("Confirm"),

        primary_action(values) {


            // Domestic / Merchant
            if (values.sales_type === "Domestic / Merchant") {

                if (!values.buyer_type) {
                    frappe.msgprint(__("Please select Buyer Type"));
                    return;
                }

                frm.set_value("custom_buyer_type", values.buyer_type);
                frm.set_value("custom_type_of_buyer", "");

            }

            // Direct Export Sales
            if (values.sales_type === "Direct Export Sales") {

                if (!values.type_of_buyer) {
                    frappe.msgprint(__("Please select Type of Buyer"));
                    return;
                }

                frm.set_value("custom_type_of_buyer", values.type_of_buyer);
                frm.set_value("custom_buyer_type", "");
            }

            dialog.hide();
        }
    });

    dialog.show();
}