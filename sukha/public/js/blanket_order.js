frappe.ui.form.on("Blanket Order", {
	customer_address:function(frm){
		if (frm.doc.customer_address) {
			frappe.call({
				method: "frappe.contacts.doctype.address.address.get_address_display",
				args: { address_dict: frm.doc.customer_address },
				callback: function (r) {
					if (r.message) {
						frm.set_value(
							"address",
							frappe.utils.html2text(r.message)
						);
					}
				},
			});
		} else {
			frm.set_value("address", "");
		}
	},
	shipping_address_name:function(frm){
		if (frm.doc.shipping_address_name) {
			frappe.call({
				method: "frappe.contacts.doctype.address.address.get_address_display",
				args: { address_dict: frm.doc.shipping_address_name },
				callback: function (r) {
					if (r.message) {
						frm.set_value(
							"custom_shipping_address",
							frappe.utils.html2text(r.message)
						);
					}
				},
			});
		} else {
			frm.set_value("custom_shipping_address", "");
		}
	},
	notify_address_name:function(frm){
		if (frm.doc.notify_address_name) {
			frappe.call({
				method: "frappe.contacts.doctype.address.address.get_address_display",
				args: { address_dict: frm.doc.notify_address_name },
				callback: function (r) {
					if (r.message) {
						frm.set_value(
							"notify_company_address",
							frappe.utils.html2text(r.message)
						);
					}
				},
			});
		} else {
			frm.set_value("notify_company_address", "");
		}
	},
	setup: function (frm) {
		if (frm.custom_make_buttons) {
			delete frm.custom_make_buttons["Sales Order"];
		}
	},
	refresh: function (frm) {
		if (frm.doc.__islocal) {
            if (!frm.doc.currency) {
                frm.set_value('currency', frappe.defaults.get_user_default('currency'));
            }
            if (!frm.doc.conversion_rate) {
                frm.set_value('conversion_rate', 1.0);
            }
        }
		set_customer_address_query(frm);
		set_shipping_address_name_query(frm);
		set_notify_address_name_query(frm);
		setTimeout(function () {
			frm.remove_custom_button("Sales Order", "Create");
			if (frm.doc.customer && frm.doc.docstatus === 1 && frm.doc.to_date > frappe.datetime.get_today()) {
				frm.add_custom_button(
					__("Sales Order"),
					function () {
						erpnext.blanket_order_custom.show_item_selection_dialog(frm, "Sales Order");
					},
					__("Create")
				);
			}
		}, 0);
	},
	currency: function(frm) {
        if (frm.doc.currency && frm.doc.company) {
            const company_currency = frappe.get_doc(':Company', frm.doc.company).default_currency;
            if (frm.doc.currency !== company_currency) {
                frm.call({
                    method: 'erpnext.setup.utils.get_exchange_rate',
                    args: {
                        from_currency: frm.doc.currency,
                        to_currency: company_currency,
                        transaction_date: frm.doc.transaction_date || frappe.datetime.get_today()
                    },
                    callback: function(r) {
                        if (r.message) {
                            frm.set_value('conversion_rate', r.message);
                            calculate_base_rate(frm);
                        }
                    }
                });
            } else {
                frm.set_value('conversion_rate', 1.0);
                calculate_base_rate(frm);
            }
        }
    },
	conversion_rate: function(frm) {
        calculate_base_rate(frm);
    },
	transaction_date: function(frm) {
        if (frm.doc.currency && frm.doc.company) {
            const company_currency = frappe.get_doc(':Company', frm.doc.company).default_currency;
            if (frm.doc.currency !== company_currency) {
                frm.trigger('currency');
            }
        }
    },
	company: function(frm) {
        if (frm.doc.__islocal || frm.doc.currency) {
            frm.trigger('currency');
        }
    }
});

frappe.ui.form.on('Blanket Order Item', {
    rate: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (frm.doc.conversion_rate && row.rate) {
            const base_rate = flt(row.rate) * flt(frm.doc.conversion_rate);
            frappe.model.set_value(cdt, cdn, 'base_rate', base_rate);
            frappe.model.set_value(cdt, cdn, 'base_amount', base_rate * flt(row.qty));
        }
        frappe.model.set_value(cdt, cdn, 'amount', flt(row.rate) * flt(row.qty));
    },

    qty: function(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (frm.doc.conversion_rate && row.rate) {
            const base_rate = flt(row.rate) * flt(frm.doc.conversion_rate);
            frappe.model.set_value(cdt, cdn, 'base_rate', base_rate);
            frappe.model.set_value(cdt, cdn, 'base_amount', base_rate * flt(row.qty));
        }
        frappe.model.set_value(cdt, cdn, 'amount', flt(row.rate) * flt(row.qty));
    }
});

function calculate_base_rate(frm) {
    if (!frm.doc.conversion_rate || !frm.doc.items) return;

    frm.doc.items.forEach(function(item) {
        if (item.rate) {
            const base_rate = flt(item.rate) * flt(frm.doc.conversion_rate);
            const base_amount = base_rate * flt(item.qty);
            const amount = flt(item.rate) * flt(item.qty);
            
            frappe.model.set_value(item.doctype, item.name, 'base_rate', base_rate);
            frappe.model.set_value(item.doctype, item.name, 'base_amount', base_amount);
            frappe.model.set_value(item.doctype, item.name, 'amount', amount);
        }
    });

    frm.refresh_field('items');
}

erpnext.blanket_order_custom = erpnext.blanket_order_custom || {};

erpnext.blanket_order_custom.show_item_selection_dialog = function (frm, target_doctype) {
	let countries = [
		...new Set(
			(frm.doc.items || [])
				.map((i) => i.custom_final_country_of_destination)
				.filter((v) => !!v)
		),
	];

	let dialog = new frappe.ui.Dialog({
		title: __("Select Items for {0}", [target_doctype]),
		size: "large",
		fields: [
			{
				fieldtype: "Select",
				fieldname: "country_filter",
				label: __("Final Country of Destination"),
				reqd: 0,
				options: [""].concat(countries),
				onchange: function () {
					erpnext.blanket_order_custom.render_item_table(
						dialog,
						frm,
						dialog.get_value("country_filter")
					);
				},
			},
			{
				fieldtype: "HTML",
				fieldname: "items_html",
			},
		],
		primary_action_label: __("Create"),
		primary_action: function () {
	let selected = dialog.selected_items || [];

	if (!selected.length) {
		frappe.msgprint(__("Please select at least one item"));
		return;
	}

	dialog.hide();

	erpnext.blanket_order_custom.create_order(
		frm,
		target_doctype,
		selected,
		dialog.get_value("country_filter")
	);
},
	});

	dialog.selected_items = [];
	erpnext.blanket_order_custom.render_item_table(dialog, frm, "");
	dialog.show();
};

erpnext.blanket_order_custom.render_item_table = function (dialog, frm, country_filter) {
	let items = (frm.doc.items || []).filter(
		(i) => !country_filter || i.custom_final_country_of_destination === country_filter
	);

	let rows = items
		.map((item) => {
			let checked = dialog.selected_items.includes(item.name) ? "checked" : "";
			return `
				<tr>
					<td style="text-align:center;">
						<input type="checkbox" class="item-select-checkbox" data-name="${item.name}" ${checked}>
					</td>
					<td>${frappe.utils.escape_html(item.item_code || "")}</td>
					<td>${frappe.utils.escape_html(item.item_name || "")}</td>
					<td>${frappe.utils.escape_html(item.custom_final_country_of_destination || "")}</td>
					<td style="text-align:right;">${item.qty}</td>
					<td style="text-align:right;">${item.ordered_qty || 0}</td>
				</tr>
			`;
		})
		.join("");

	let html = `
		<div style="max-height: 320px; overflow-y: auto; margin-top: 10px;">
		<table class="table table-bordered">
			<thead>
				<tr>
					<th style="width:40px;"><input type="checkbox" id="select-all-items"></th>
					<th>${__("Item Code")}</th>
					<th>${__("Item Name")}</th>
					<th>${__("Destination")}</th>
					<th>${__("Qty")}</th>
					<th>${__("Ordered Qty")}</th>
				</tr>
			</thead>
			<tbody>
				${rows || `<tr><td colspan="6" style="text-align:center;">${__("No items found")}</td></tr>`}
			</tbody>
		</table>
		</div>
	`;

	let $wrapper = dialog.fields_dict.items_html.$wrapper;
	$wrapper.html(html);

	$wrapper.find(".item-select-checkbox").on("change", function () {
		let name = $(this).attr("data-name");
		if ($(this).is(":checked")) {
			if (!dialog.selected_items.includes(name)) dialog.selected_items.push(name);
		} else {
			dialog.selected_items = dialog.selected_items.filter((n) => n !== name);
		}
	});

	$wrapper.find("#select-all-items").on("change", function () {
		let checked = $(this).is(":checked");
		$wrapper.find(".item-select-checkbox").prop("checked", checked).trigger("change");
	});
};

erpnext.blanket_order_custom.create_order = function (
	frm,
	target_doctype,
	selected_items,
	country
) {
	frappe.call({
		method: "sukha.override.blanket_order.make_order",
		args: {
			source_name: frm.doc.name,
			target_doctype: target_doctype,
			selected_items: selected_items,
			country: country,
		},
		freeze: true,
		freeze_message: __("Creating {0}...", [target_doctype]),
		callback: function (r) {
			if (r.message) {
				frappe.model.sync(r.message);
				frappe.set_route("Form", r.message.doctype, r.message.name);
			}
		},
	});
};

function set_shipping_address_name_query(frm) {
	frm.set_query("shipping_address_name", () => {
		return {
			query: "frappe.contacts.doctype.address.address.address_query",
			filters: {
				link_doctype: "Customer",
				link_name: frm.doc.customer
			}
		};
	});
}
function set_customer_address_query(frm) {
	frm.set_query("customer_address", () => {
		return {
			query: "frappe.contacts.doctype.address.address.address_query",
			filters: {
				link_doctype: "Customer",
				link_name: frm.doc.customer
			}
		};
	});
}
function set_notify_address_name_query(frm) {
	frm.set_query("notify_address_name", () => {
		return {
			query: "frappe.contacts.doctype.address.address.address_query",
			filters: {
				link_doctype: "Customer",
				link_name: frm.doc.customer
			}
		};
	});
}
