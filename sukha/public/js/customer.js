frappe.ui.form.on("Customer", {

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
