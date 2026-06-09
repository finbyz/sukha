frappe.ui.form.on("Customer", {

	// refresh: function(frm) {
	// 	render_customer_summary(frm);
	// },

	custom_same_as_bill_to_party(frm) {

		if (!frm.doc.custom_same_as_bill_to_party) return;

		frm.clear_table("custom_ship_to_party_details");

		(frm.doc.custom_bill_to_party_details || []).forEach(d => {

			let row = frm.add_child("custom_ship_to_party_details");

			row.consignee_name = d.bill_to_party_name;
			row.contact_person_name = d.contact_person_name;
			row.contact_number = d.contact_no;
			row.email = d.email;

			row.address = d.address;
			row.street = d.street;
			row.city = d.city;
			row.country = d.country;
			row.pincode = d.pincode;

			row.tax_id = d.tax_id;
			row.vat_no = d.vat_no;
			row.ruc_no = d.ruc_no;
		});

		frm.refresh_field("custom_ship_to_party_details");

		frappe.show_alert({
			message: __("Bill To Party copied to Ship To Party"),
			indicator: "green"
		});
	},

	custom_same_as_ship_to_party_details(frm) {

		if (!frm.doc.custom_same_as_ship_to_party_details) return;

		frm.clear_table("custom_notify_party_details");

		(frm.doc.custom_ship_to_party_details || []).forEach(d => {

			let row = frm.add_child("custom_notify_party_details");

			row.name1 = d.consignee_name;
			row.contact_person_name = d.contact_person_name;
			row.contact_number = d.contact_number;
			row.email = d.email;

			row.address = d.address;
			row.street = d.street;
			row.city = d.city;
			row.country = d.country;
			row.pincode = d.pincode;

			row.tax_id = d.tax_id;
			row.vat_no = d.vat_no;
			row.ruc_no = d.ruc_no;
		});

		frm.refresh_field("custom_notify_party_details");

		frappe.show_alert({
			message: __("Ship To Party copied to Notify Party"),
			indicator: "green"
		});
	}

});


frappe.ui.form.on("Bill to Party Details", {
	form_render(frm) {
		if (frm.doc.custom_same_as_bill_to_party) {
			frm.trigger("custom_same_as_bill_to_party");
		}
	}
});

frappe.ui.form.on("Ship To Party Details", {
	form_render(frm) {
		if (frm.doc.custom_same_as_ship_to_party_details) {
			frm.trigger("custom_same_as_ship_to_party_details");
		}
	}
});


// Helper function to create summary items
function customer_summary_item(label, value) {
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


// Render Customer Summary Dashboard
// function render_customer_summary(frm) {
//     if (!frm?.page?.body || frm.is_new()) return;

//     const $body = $(frm.page.body);
//     $body.find("#customer-summary").remove();

//     const customer = frm.doc;

//     // ── L0 fields (Organization/Company Information) ──────────────
//     const l0Fields = `
//         ${customer_summary_item("Customer Name", customer.customer_name)}
//         ${customer_summary_item("Customer Type", customer.customer_type)}
//         ${customer_summary_item("Customer Group", customer.customer_group)}
//         ${customer_summary_item("Territory", customer.territory)}
//         ${customer_summary_item("Customer Profile Type", customer.custom_customer_profile_type)}
//         ${customer_summary_item("Specific Customer Category", customer.custom_specific_customer_category)}
//         ${customer_summary_item("Type of Buyer", customer.custom_type_of_buyer)}
//         ${customer_summary_item("Industry Type", customer.custom_industry_type)}
//         ${customer_summary_item("Country of HQ", customer.custom_country_of_hq)}
//         ${customer_summary_item("Website", customer.website ? `<a href="${customer.website.startsWith('http') ? customer.website : 'https://' + customer.website}" target="_blank" style="color:var(--primary);text-decoration:none;font-weight:600;">${customer.website}</a>` : "")}
//         ${customer_summary_item("LinkedIn", customer.custom_linkedin ? `<a href="${customer.custom_linkedin.startsWith('http') ? customer.custom_linkedin : 'https://' + customer.custom_linkedin}" target="_blank" style="color:var(--primary);text-decoration:none;font-weight:600;">${customer.custom_linkedin}</a>` : "")}
//         ${customer_summary_item("Central Email", customer.custom_central_email_id)}
//         ${customer_summary_item("Revenue (Mil US$)", customer.custom_approx_revenue_in_mil_us)}
//         ${customer_summary_item("Employee Size", customer.custom_employee_size_on_linkedin)}
//         ${customer_summary_item("Source of Lead", customer.custom_source_of_the_lead)}
//     `;

//     // ── L1 fields (Product and Basic Contact Information) ─────────
//     const l1Fields = `
//         ${customer_summary_item("Product Name", customer.custom_product_name)}
//         ${customer_summary_item("Volume Range", customer.custom_volume_range)}
//         ${customer_summary_item("Product Category", customer.custom_product_category)}
//         ${customer_summary_item("Contact Person", customer.custom_contact_person)}
//         ${customer_summary_item("Contact Email", customer.custom_contact_person_email_id)}
//         ${customer_summary_item("Contact Phone", customer.custom_contact_person_phone_number)}
//         ${customer_summary_item("WhatsApp", customer.custom_contact_person_whatsapp_number)}
//         ${customer_summary_item("Designation/Department", customer.custom_contact_person_designation__department)}
//         ${customer_summary_item("Bill To Party Name", customer.custom_bill_to_party_name)}
//         ${customer_summary_item("Bill To Party Country", customer.custom_bill_to_party_country)}
//         ${customer_summary_item("Bill To Party Address", customer.custom_bill_to_party_address)}
//         ${customer_summary_item("Country of Destination", customer.custom_country_of_destination)}
//         ${customer_summary_item("Port of Destination", customer.custom_port_of_destination)}
//     `;

//     // ── L2 fields (Commercial Terms and Decision Makers) ──────────
//     const l2Fields = `
//         ${customer_summary_item("Approved Incoterms", customer.custom_approved_incoterms)}
//         ${customer_summary_item("Current Supplier", customer.custom_current_supplier)}
//         ${customer_summary_item("Approved Payment Terms", customer.custom_approved_payment_terms)}
//         ${customer_summary_item("Decision Role", customer.custom_decision_role)}
//         ${customer_summary_item("Preferred Communication", customer.custom_preferred_communication)}
//         ${customer_summary_item("Sales Type", customer.custom_sales_type)}
//         ${customer_summary_item("Notes", customer.custom_notes)}
//     `;

//     // Check if any section has content
//     const hasL0 = l0Fields.trim() !== "";
//     const hasL1 = l1Fields.trim() !== "";
//     const hasL2 = l2Fields.trim() !== "";

//     if (!hasL0 && !hasL1 && !hasL2) return;

//     const html = `
//         <div id="customer-summary" style="
//             background:#ffffff;
//             border:1px solid var(--border-color);
//             border-radius:16px;
//             margin-bottom:20px;
//             overflow:hidden;
//         ">
//             <!-- HEADER -->
//             <div style="padding:20px;border-bottom:1px solid #e2e8f0;background:var(--subtle-fg);">
//                 <div style="font-size:22px;font-weight:700;color:#111827;">
//                     ${customer.customer_name || customer.name}
//                 </div>
//                 <div style="margin-top:4px;color:var(--text-muted);font-size:13px;">Customer Dashboard - L3/Qualified</div>
//             </div>

//             <!-- CUSTOMER DETAIL AREA -->
//             <div style="padding:24px;background:#ffffff;">
//                 <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px;">
//                     <div>
//                         <a href="/app/customer/${customer.name}" target="_blank" style="
//                             font-size:15px;color:var(--primary);text-decoration:none;font-weight:bold;
//                         ">${customer.name}</a>
//                         <div style="color:var(--text-muted);margin-top:3px;font-size:13px;">
//                             ${customer.customer_group || ""}
//                         </div>
//                     </div>
//                     <span style="
//                         background:#dbeafe;color:#1d4ed8;
//                         padding:6px 14px;border-radius:999px;
//                         font-size:12px;font-weight:600;
//                     ">
//                         ${customer.custom_customer_profile_type || "Customer"}
//                     </span>
//                 </div>

//                 <!-- L0 / L1 / L2 sub-tab buttons -->
//                 <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid #e2e8f0;">
//                     <button class="customer-section-tab btn btn-sm" data-section="l0" style="
//                         padding:7px 20px;border-radius:8px 8px 0 0;border:1px solid var(--border-color);
//                         border-bottom:none;background:var(--primary);color:var(--white);font-weight:600;
//                         cursor:pointer;font-size:13px;
//                     ">L0</button>
//                     <button class="customer-section-tab btn btn-sm" data-section="l1" style="
//                         padding:7px 20px;border-radius:8px 8px 0 0;border:1px solid var(--border-color);
//                         border-bottom:none;background:var(--subtle-fg);color:var(--text);font-weight:600;
//                         cursor:pointer;font-size:13px;
//                     ">L1</button>
//                     <button class="customer-section-tab btn btn-sm" data-section="l2" style="
//                         padding:7px 20px;border-radius:8px 8px 0 0;border:1px solid var(--border-color);
//                         border-bottom:none;background:var(--subtle-fg);color:var(--text);font-weight:600;
//                         cursor:pointer;font-size:13px;
//                     ">L2</button>
//                 </div>

//                 <!-- Section panels -->
//                 <div class="customer-section-panel" id="customer-panel-l0" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
//                     ${l0Fields}
//                 </div>
//                 <div class="customer-section-panel" id="customer-panel-l1" style="display:none;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
//                     ${l1Fields}
//                 </div>
//                 <div class="customer-section-panel" id="customer-panel-l2" style="display:none;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
//                     ${l2Fields}
//                 </div>
//             </div>
//         </div>
//     `;

//     const $target = $body.find(".layout-main-section").first();
//     ($target.length ? $target : $body).prepend(html);

//     // Setup tab switching
//     $body.off("click", ".customer-section-tab").on("click", ".customer-section-tab", function () {
//         const section = $(this).data("section");
//         $(".customer-section-tab").css({ background: "var(--subtle-fg)", color: "var(--text)" });
//         $(this).css({ background: "var(--primary)", color: "var(--white)" });
//         $(".customer-section-panel").hide();
//         $("#customer-panel-" + section).css("display", "grid");
//     });
// }
