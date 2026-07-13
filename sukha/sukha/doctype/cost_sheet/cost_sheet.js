// Copyright (c) 2026, kaustubh and contributors
// For license information, please see license.txt

frappe.ui.form.on("Cost Sheet", {
	refresh(frm) {
		// Add custom button to open Cost Sheet Dashboard with current values
		if (frm.doc.name && frm.doc.docstatus === 1) {
			var btn = frm.add_custom_button(__('Open in Dashboard'), function() {
				const params = new URLSearchParams({
					source_doctype: 'Cost Sheet',
					source_name: frm.doc.name
				});

				// Route to Cost Sheet Dashboard with reload-safe URL context.
				window.location.href = `/app/cost-sheet-dashboard?${params.toString()}`;

				frappe.show_alert({
					message: __('Loading cost sheet in dashboard...'),
					indicator: 'green'
				}, 3);
			});
			btn.addClass("btn-primary");
		}
	},
	before_workflow_action(frm) {
		if (frm.selected_workflow_action === "Reject") {
			frappe.validated = false; // pause the default workflow action

			frappe.prompt(
				[
					{
						fieldname: 'remarks',
						label: 'Rejection Remarks',
						fieldtype: 'Small Text',
						reqd: 1
					}
				],
				function(values) {
					frm.set_value('remarks', values.remarks);
					frm.save().then(() => {
						frappe.model.execute_workflow_action(
							frm.doc.doctype,
							frm.doc.name,
							frm.selected_workflow_action
						);
					});
				},
				'Enter Rejection Remarks',
				'Reject'
			);
		}
	}
});