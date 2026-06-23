frappe.pages['cost-sheet-dashboard'].on_page_load = function (wrapper) {
	wrapper.cost_sheet_dashboard = new CostSheetDashboard(wrapper);
};

frappe.pages['cost-sheet-dashboard'].on_page_show = function (wrapper) {
	if (wrapper.cost_sheet_dashboard) {
		const iframe = document.getElementById('cost-sheet-iframe');
		if (iframe && wrapper.cost_sheet_dashboard.iframe_loaded) {
			// Small delay to ensure DOM is ready
			setTimeout(() => {
				wrapper.cost_sheet_dashboard.load_cost_sheet_data(iframe);
			}, 100);
		}
	}
};

class CostSheetDashboard {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Cost Sheet Engine',
			single_column: true
		});

		this.wrapper = $(wrapper);
		this.page_content = this.wrapper.find('.page-content');

		this.setup_page();
		this.render_html();
	}

	setup_page() {
		this.page.set_primary_action('Save Cost Sheet', () => {
			this.save_cost_sheet();
		}, 'octicon octicon-check');

		this.page.add_menu_item('New Cost Sheet', () => {
			this.reset_form();
		});

		this.page.add_menu_item('Load Existing', () => {
			this.show_cost_sheet_selector();
		});

		this.setup_search();
	}

	setup_search() {
		const search_html = `
			<div class="form-group" style="margin: 0; min-width: 300px;">
				<input type="text"
					class="form-control"
					id="cost-sheet-search"
					placeholder="Search in form fields..."
					style="padding: 6px 12px; font-size: 13px;">
			</div>
		`;
		$(this.page.wrapper).find('.page-head-content .standard-actions').prepend(search_html);

		let search_timeout;
		$('#cost-sheet-search').on('input', (e) => {
			clearTimeout(search_timeout);
			search_timeout = setTimeout(() => {
				this.search_in_form(e.target.value);
			}, 300);
		});
	}

	search_in_form(query) {
		const iframe = document.getElementById('cost-sheet-iframe');
		if (!iframe || !iframe.contentWindow) return;

		try {
			const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
			$(iframeDoc).find('.search-highlight').removeClass('search-highlight');

			if (!query || query.length < 2) return;

			const searchableElements = $(iframeDoc).find('input, select, textarea, label, .rp-summary-val, .kpi-box-val');
			let first_match = true;

			searchableElements.each(function () {
				const $el = $(this);
				let text = $el.is('input, select, textarea') ? ($el.val() || '') : ($el.text() || '');

				if (text.toLowerCase().includes(query.toLowerCase())) {
					if ($el.is('input, select, textarea')) {
						$el.addClass('search-highlight');
					} else {
						$el.closest('.form-group, .kb-stat, .section-card').addClass('search-highlight');
					}
					if (first_match) {
						$el[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
						first_match = false;
					}
				}
			});

			if (!$(iframeDoc).find('#search-highlight-style').length) {
				$(iframeDoc.head).append(`
					<style id="search-highlight-style">
						.search-highlight {
							background-color: var(--yellow-100, #FEF3C7) !important;
							border: 2px solid var(--yellow-500, #F59E0B) !important;
							border-radius: 4px;
							transition: all 0.3s;
						}
					</style>
				`);
			}
		} catch (e) {
			console.error('Search error:', e);
		}
	}

	render_html() {
		this.page_content.html(`
			<div style="width: 100%; height: calc(100vh - 100px); overflow: hidden; position: relative;">
				<div id="loading-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; z-index: 1000;">
					<div style="text-align: center;">
						<div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
							<span class="sr-only">Loading...</span>
						</div>
						<p style="margin-top: 15px; color: #6c757d;">Loading Cost Sheet...</p>
					</div>
				</div>
				<iframe
					src="/cost_sheet?v=${Date.now()}"
					style="width: 100%; height: 100%; border: none;"
					id="cost-sheet-iframe"
				></iframe>
			</div>
		`);

		this.setup_iframe_communication();

		const iframe = document.getElementById('cost-sheet-iframe');
		if (iframe) {
			iframe.onload = () => {
				this.iframe_loaded = true;

				this.setup_dynamic_link_fields(iframe);
				this.setup_dynamic_required_fields(iframe);

				// Poll until key dropdowns are populated, then load data from localStorage
				const waitForDropdowns = () => {
					const doc = iframe.contentDocument || iframe.contentWindow.document;
					const productSel = doc.getElementById('inp_product');
					const customerSel = doc.getElementById('inp_customer');

					if (productSel && productSel.options && productSel.options.length > 1 &&
						customerSel && customerSel.options && customerSel.options.length > 1) {
						this.load_cost_sheet_data(iframe);
						setTimeout(() => this.hide_loading_overlay(), 500);
					} else {
						setTimeout(waitForDropdowns, 200);
					}
				};
				setTimeout(waitForDropdowns, 500);
			};
		}
	}

	hide_loading_overlay() {
		const overlay = document.getElementById('loading-overlay');
		if (overlay) {
			overlay.style.transition = 'opacity 0.3s';
			overlay.style.opacity = '0';
			setTimeout(() => {
				overlay.remove();
			}, 300);
		}
	}

	setup_iframe_communication() {
		window.addEventListener('message', (event) => {
			if (event.data.type === 'save_cost_sheet') {
				this.save_cost_sheet_from_iframe(event.data.data);
			}

			// Std Packing weight fetch request from iframe
			if (event.data.type === 'fetch_std_packing_weight') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;

				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Standard Packing',
						filters: { name: event.data.std_packing },
						fieldname: ['weight']
					},
					callback: (r) => {
						let weight = '';
						if (r.message && typeof r.message === 'object') {
							weight = r.message.weight || '';
						} else if (r.message) {
							weight = r.message;
						}
						iframe.contentWindow.postMessage({ type: 'std_packing_weight_response', weight: weight }, '*');
					}
				});
			}

			// Incoterm details fetch request from iframe
			if (event.data.type === 'fetch_incoterm_details') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;

				frappe.call({
					method: 'frappe.client.get',
					args: {
						doctype: 'Incoterm',
						name: event.data.incoterm
					},
					callback: (r) => {
						iframe.contentWindow.postMessage({
							type: 'incoterm_details_response',
							incoterm: event.data.incoterm,
							doc: r.message || null
						}, '*');
					}
				});
			}

			// Product grade fetch request from iframe
			if (event.data.type === 'fetch_product_grade') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				// First try direct fetch using custom_item_grade
				frappe.call({
					method: 'frappe.client.get',
					args: {
						doctype: 'Item',
						name: event.data.item
					},
					callback: (r) => {
						const doc = r.message || {};
						const grade = doc.custom_item_grade || '';
						const parentItem = doc.variant_of || '';
						const packings = doc.custom_packing_type || [];
						const stdPackings = doc.custom_std_pakcing || [];

						if (grade || packings.length || stdPackings.length) {
							iframe.contentWindow.postMessage({ type: 'product_grade_response', grade, packings, stdPackings }, '*');
						} else if (parentItem) {
							// Variant — check parent template
							frappe.call({
								method: 'frappe.client.get',
								args: {
									doctype: 'Item',
									name: parentItem
								},
								callback: (rp) => {
									const pDoc = rp.message || {};
									const parentGrade = pDoc.custom_item_grade || '';
									const pPackings = pDoc.custom_packing_type || [];
									const pStdPackings = pDoc.custom_std_pakcing || [];
									iframe.contentWindow.postMessage(
										{ type: 'product_grade_response', grade: parentGrade, packings: pPackings, stdPackings: pStdPackings },
										'*'
									);
								}
							});
						} else {
							iframe.contentWindow.postMessage({ type: 'product_grade_response', grade: '', packings: [], stdPackings: [] }, '*');
						}
					}
				});
			}
			// Exchange rate fetch request from iframe
			if (event.data.type === 'fetch_exchange_rate') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Currency Exchange',
						filters: [
							['from_currency', '=', event.data.from_currency],
							['to_currency', '=', event.data.to_currency]
						],
						fieldname: 'exchange_rate',
						order_by: 'date desc'
					},
					callback: (r) => {
						iframe.contentWindow.postMessage({
							type: 'exchange_rate_response',
							exchange_rate: (r.message || {}).exchange_rate || null,
							from_currency: event.data.from_currency
						}, '*');
					}
				});
			}
			// Supplier stuffing location fetch request from iframe
			if (event.data.type === 'fetch_supplier_stuffing_location') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Supplier',
						filters: { name: event.data.supplier },
						fieldname: 'custom_stuffing_location'
					},
					callback: (r) => {
						const location = (r.message || {}).custom_stuffing_location || "Supplier's Premises";
						iframe.contentWindow.postMessage({
							type: 'supplier_stuffing_location_response',
							location: location
						}, '*');
					}
				});
			}
			// Warehouse fetch request from iframe
			if (event.data.type === 'fetch_warehouses') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				frappe.call({
					method: 'frappe.client.get_list',
					args: {
						doctype: 'Warehouse',
						fields: ['name'],
						limit_page_length: 500,
						order_by: 'name asc'
					},
					callback: (r) => {
						iframe.contentWindow.postMessage({
							type: 'warehouses_response',
							warehouses: r.message || []
						}, '*');
					}
				});
			}
			// Customer name fetch request from iframe
			if (event.data.type === 'fetch_customer_name') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Customer',
						filters: { name: event.data.customer },
						fieldname: 'customer_name'
					},
					callback: (r) => {
						const customer_name = (r.message || {}).customer_name || '';
						iframe.contentWindow.postMessage({
							type: 'customer_name_response',
							customer_name: customer_name
						}, '*');
					}
				});
			}
		});
	}

	save_cost_sheet_from_iframe(data) {
		frappe.call({
			method: 'sukha.sukha.doctype.cost_sheet.cost_sheet.create_from_dashboard',
			args: { data: data },
			callback: (r) => {
				if (r.message) {
					frappe.msgprint({
						title: __('Success'),
						message: __('Cost Sheet saved successfully'),
						indicator: 'green'
					});
					// Clear localStorage after successful save
					localStorage.removeItem('cost_sheet_load_data');
					// DO NOT route to form - just stay on dashboard
				}
			},
			error: (r) => {
				frappe.msgprint({
					title: __('Error'),
					message: __('Failed to save Cost Sheet. Please try again.'),
					indicator: 'red'
				});
			}
		});
	}

	save_cost_sheet() {
		const iframe = document.getElementById('cost-sheet-iframe');
		if (!iframe) {
			frappe.msgprint(__('Cost sheet form not loaded. Please refresh the page.'));
			return;
		}
		if (!iframe.contentWindow) {
			frappe.msgprint(__('Cost sheet form is still loading. Please wait.'));
			return;
		}

		if (!this.validate_dynamic_required(iframe)) return;

		try {
			if (typeof iframe.contentWindow.saveCostSheet === 'function') {
				iframe.contentWindow.saveCostSheet();
			} else {
				setTimeout(() => {
					if (typeof iframe.contentWindow.saveCostSheet === 'function') {
						iframe.contentWindow.saveCostSheet();
					} else {
						frappe.msgprint(__('Cost sheet form not ready. Please refresh and try again.'));
					}
				}, 500);
			}
		} catch (e) {
			console.error('Error calling saveCostSheet:', e);
			frappe.msgprint({
				title: __('Error'),
				indicator: 'red',
				message: __('Unable to save cost sheet. Error: ' + e.message)
			});
		}
	}

	reset_form() {
		const iframe = document.getElementById('cost-sheet-iframe');
		if (iframe) iframe.src = iframe.src;
	}

	show_cost_sheet_selector() {
		const me = this;
		new frappe.ui.form.MultiSelectDialog({
			doctype: 'Cost Sheet',
			target: this,
			setters: {
				cost_sheet_type: null,
				status: null
			},
			action(selections) {
				if (selections && selections.length > 0) {
					frappe.call({
						method: 'frappe.client.get',
						args: {
							doctype: 'Cost Sheet',
							name: selections[0]
						},
						callback: function (r) {
							if (r.message) {
								const iframe = document.getElementById('cost-sheet-iframe');
								// Call load_cost_sheet_data directly with the fetched doc
								localStorage.setItem('cost_sheet_load_data', JSON.stringify(r.message));
								me.load_cost_sheet_data(iframe);
								cur_dialog.hide();
								frappe.show_alert({
									message: __('Loaded Cost Sheet data into dashboard.'),
									indicator: 'green'
								}, 3);
							}
						}
					});
				}
			}
		});
	}

	// ─────────────────────────────────────────────────────────────
	// LOAD COST SHEET DATA FROM LOCALSTORAGE
	// ─────────────────────────────────────────────────────────────

	load_cost_sheet_data(iframe) {
		try {
			const storedData = localStorage.getItem('cost_sheet_load_data');
			if (!storedData) return;

			const data = JSON.parse(storedData);
			const doc = iframe.contentDocument || iframe.contentWindow.document;

			console.log('Loading Cost Sheet data:', data);

			// Handle Lead/Prospect/Customer conditional display
			const oppFrom = data.opportunity_from;
			const partyName = data.party_name;

			// Get the wrapper elements
			const customerWrapper = doc.getElementById('wrapper-customer');
			const leadWrapper = doc.getElementById('wrapper-lead');
			const prospectWrapper = doc.getElementById('wrapper-prospect');
			const leadInput = doc.getElementById('inp_lead');
			const prospectInput = doc.getElementById('inp_prospect');

			// Hide all by default
			if (customerWrapper) customerWrapper.style.display = 'none';
			if (leadWrapper) leadWrapper.style.display = 'none';
			if (prospectWrapper) prospectWrapper.style.display = 'none';

			// Show the appropriate one based on opportunity_from or direct cost sheet data
			if ((oppFrom === 'Lead' && partyName) || data.lead) {
				const val = (oppFrom === 'Lead' ? partyName : data.lead);
				console.log('Showing Lead field with:', val);
				if (leadWrapper) leadWrapper.style.display = 'block';
				if (leadInput) {
					leadInput.value = val;
					leadInput.readOnly = true;
				}
				// Clear customer from data to prevent it being set
				delete data.customer;
			} else if ((((oppFrom === 'Prospect' || oppFrom === 'Prospect (L3/Qualified)') && partyName)) || data.prospect) {
				const val = ((oppFrom === 'Prospect' || oppFrom === 'Prospect (L3/Qualified)') && partyName ? partyName : data.prospect);
				console.log('Showing Prospect field with:', val);
				if (prospectWrapper) prospectWrapper.style.display = 'block';
				if (prospectInput) {
					prospectInput.value = val;
					prospectInput.readOnly = true;
				}
				// Clear customer from data to prevent it being set
				delete data.customer;
			} else if ((oppFrom === 'Customer' && partyName) || data.customer) {
				const val = (oppFrom === 'Customer' ? partyName : data.customer);
				console.log('Showing Customer field with:', val);
				if (customerWrapper) customerWrapper.style.display = 'block';
				// Set customer in data so it gets populated by field mapping
				data.customer = val;
			} else {
				// Default: show customer dropdown
				console.log('Showing default Customer field');
				if (customerWrapper) customerWrapper.style.display = 'block';
			}

			// Map Cost Sheet doctype fields to iframe input IDs
			const fieldMapping = {
				// Basic Info
				'product': 'inp_product',
				'product_grade': 'inp_grade',
				'customer': 'inp_customer',
				'customer_name': 'inp_party_name',
				'supplier': 'inp_supplier',
				'company': 'inp_company',

				// Payment Terms
				'customer_payment_terms': 'inp_cust_terms',
				'customer_payment_term': 'inp_cust_terms',
				'supplier_payment_terms': 'inp_supp_terms',

				// Locations & Logistics
				'country_of_destination': 'inp_destination',
				'final_country_of_destination': 'inp_final_dest',
				'port_of_discharge': 'inp_pod',
				'port_of_loading': 'inp_pol',
				'delivery_location': 'inp_destination',
				'stuffing_at': 'inp_stuffing_at',
				'stuffing_location': 'inp_stuffing_loc',
				'stuffing_warehouse': 'inp_stuffing_loc',

				// Container & Packing
				'container_type': 'inp_container',
				'packing_type': 'inp_packing_type',
				'custom_packing_type': 'inp_packing_type',
				'packing_unit_size': 'inp_unit_size',
				'std_packing': 'inp_std_packing',
				'custom_std_pakcing': 'inp_std_packing',
				'units_per_fcl': 'inp_units_per_fcl',
				'total_fcl': 'inp_total_fcl',

				// Currency & Exchange
				'currency': 'inp_cs_currency',
				'exchange_premium': 'inp_exchange_premium',
				'exchange_rate': 'inp_base_rate',

				// Cost Sheet Type & Incoterm
				'cost_sheet_type': 'inp_master_cs_type',
				'incoterm': 'inp_user_incoterm',
				'origin_scope': 'inp_user_origin',
				'type_of_sale': 'inp_type_of_sale',
				'exw_sub_type': 'inp_exw_subtype',

				// Additional
				'shipping_line': 'inp_shipping_line',
				'final_offered_price': 'inp_offered_price',

				// Dashboard Raw Inputs
				'rm_delivered_cost': 'inp_rm_rs_mt',
				'pm_unit_cost': 'inp_pm_unit_cost',
				'pm_units_fcl': 'inp_pm_units_fcl',
				'repacking_cost_rs_mt': 'inp_repack_rs_mt',
				'repack_labour_fcl': 'inp_repack_labour_fcl',
				'repack_qc_fcl': 'inp_repack_qc_fcl',
				'repack_stickers_fcl': 'inp_repack_stickers_fcl',
				'vanning_rs_fcl': 'inp_vanning_rs_fcl',
				'labels_rs_mt': 'inp_labels_rs_mt',
				'labels_remarks': 'inp_labels_remarks',

				'cnf_transportation': 'inp_cnf_trans',
				'cnf_thc': 'inp_cnf_thc',
				'cnf_bl_charges': 'inp_bl_charges',
				'cnf_sea_way_bl_charges': 'inp_sea_way_bl_charges',
				'cnf_seal_charges': 'inp_cnf_seal',
				'cnf_port_handling': 'inp_cnf_port',
				'cnf_agency_charges': 'inp_cnf_agency',
				'cnf_haz_surcharge': 'inp_cnf_haz',
				'cnf_lolo_charges': 'inp_cnf_lolo',
				'cnf_other_charges': 'inp_cnf_other',

				'tc_rm_usd_mt': 'inp_tc_usd_mt',
				'tc_vanning_usd': 'inp_tc_van_usd',
				'tc_ocean_freight_fcl': 'inp_tc_sf_fcl',
				'tc_haz_surcharge_fcl': 'inp_tc_sf_haz',

				'dom_basic_price': 'inp_dom_basic_rs_mt',
				'dom_freight_inward': 'inp_dom_freight_inward',
				'dom_freight_dest': 'inp_dom_freight_dest',
				'dom_handling_cost': 'inp_dom_handling_mt',
				'dom_loading_cost': 'inp_dom_loading_tot',
				'dom_unloading_cost': 'inp_dom_unloading_tot',
				'dom_ply_price': 'inp_dom_ply_price',
				'dom_ply_units': 'inp_dom_ply_units',

				'internal_cost_percentage': 'inp_internal_cost_pct',
				'domestic_credit_percentage': 'inp_dom_credit_pct',
				'document_charges_usd': 'inp_doc_charges_usd',
				'merchant_document_charges': 'inp_mer_doc_usd_tot'
			};

			// Fields that should be set AFTER product change events settle
			// (because the iframe repopulates these dropdowns when product changes)
			const deferredFields = ['packing_type', 'custom_packing_type', 'std_packing', "custom_std_pakcing"];
			const deferredValues = {};

			// Populate main fields
			Object.keys(fieldMapping).forEach(docField => {
				if (data[docField] !== undefined && data[docField] !== null && data[docField] !== '') {
					const inputId = fieldMapping[docField];

					// Skip deferred fields for now
					if (deferredFields.includes(docField)) {
						deferredValues[docField] = data[docField];
						return;
					}

					const element = doc.getElementById(inputId);

					if (element) {
						let valueToSet = data[docField];

						// For select elements, ensure option exists before setting value
						if (element.tagName === 'SELECT') {
							const normalizedVal = this.normalize_default_value(valueToSet);
							let optionExists = Array.from(element.options).some(
								opt => opt.value === valueToSet || opt.value === normalizedVal
							);

							if (!optionExists && normalizedVal !== valueToSet) {
								valueToSet = normalizedVal;
								optionExists = Array.from(element.options).some(
									opt => opt.value === valueToSet
								);
							}

							if (!optionExists) {
								const opt = doc.createElement('option');
								opt.value = valueToSet;
								opt.textContent = valueToSet;
								element.appendChild(opt);
								if (inputId === 'inp_product' || inputId.includes('product')) {
									frappe.call({
										method: 'frappe.client.get_value',
										args: {
											doctype: 'Item',
											filters: { name: valueToSet },
											fieldname: 'item_name'
										},
										callback: function (r) {
											if (r.message && r.message.item_name) {
												opt.textContent = r.message.item_name;
											}
										}
									});
								}
							}
						}

						// Set the value
						element.value = valueToSet;

						// For numeric/manual input fields, trigger both change and input events
						if (element.type === 'number' || element.classList.contains('manual-input')) {
							const changeEvent = new Event('change', { bubbles: true });
							element.dispatchEvent(changeEvent);
							const inputEvent = new Event('input', { bubbles: true });
							element.dispatchEvent(inputEvent);
						} else {
							// For dropdowns and text fields, just trigger change
							const changeEvent = new Event('change', { bubbles: true });
							element.dispatchEvent(changeEvent);
						}

						console.log(`Loaded ${docField}: ${valueToSet} into ${inputId}, value now: ${element.value}`);
					} else {
						console.log(`Element not found: ${inputId} for ${docField}`);
					}
				}
			});

			const setInput = (id, val) => {
				const el = doc.getElementById(id);
				if (el && val !== undefined && val !== null) {
					el.value = val;
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				}
			};

			// Checkboxes - always set explicitly (both checked and unchecked)
			const rodtepEl = doc.getElementById('chk_scheme_rodtep');
			if (rodtepEl) {
				rodtepEl.checked = !!data.apply_rodtep;
				rodtepEl.dispatchEvent(new Event('change', { bubbles: true }));
			}

			const advanceEl = doc.getElementById('chk_scheme_advance');
			if (advanceEl) {
				advanceEl.checked = !!data.apply_advance_license;
				advanceEl.dispatchEvent(new Event('change', { bubbles: true }));
			}
			if (data.final_offered_price) {
				setInput('inp_offered_price_exw', data.final_offered_price);
			}
			if (data.name) {
				setInput('inp_doc_name', data.name);
			}

			// Populate child table data if available
			if (data.product_cost_details && data.product_cost_details.length > 0) {
				console.log('Loading product cost details:', data.product_cost_details);
				data.product_cost_details.forEach(row => {
					switch (row.cost_element) {
						case 'Basic Price': setInput('inp_dom_basic_rs_mt', row.rate); break;
						case 'Freight Inward': setInput('inp_dom_freight_inward', row.amount); break;
						case 'RM Delivered Cost': setInput('inp_rm_rs_mt', row.rate); break;
						case 'Primary Packing Delivered Cost':
							setInput('inp_pm_unit_cost', row.rate);
							if (data.total_fcl > 0) setInput('inp_pm_units_fcl', row.quantity / data.total_fcl);
							break;
						case 'Ply Sheet/Airbags/Pallets':
							setInput('inp_dom_ply_price', row.rate);
							if (data.total_fcl > 0) setInput('inp_dom_ply_units', row.quantity / data.total_fcl);
							break;
						case 'Repacking Cost': setInput('inp_repack_rs_mt', row.rate); break;
						case 'Repacking Labour Cost': setInput('inp_repack_labour_fcl', row.rate); break;
						case 'Stickers/Labels': setInput('inp_repack_stickers_fcl', row.rate); break;
						case 'Addl. Vanning Requirement': setInput('inp_vanning_rs_fcl', row.rate); break;
						case 'Freight Charges': setInput('inp_dom_freight_dest', row.amount); break;
						case 'Handling Cost': setInput('inp_dom_handling_cost', row.amount); break;
					}
				});
			}

			if (data.cnf_charges && data.cnf_charges.length > 0) {
				console.log('Loading CNF charges:', data.cnf_charges);
				data.cnf_charges.forEach(row => {
					switch (row.charge_type) {
						case 'Transportation': setInput('inp_cnf_trans', row.rate); break;
						case 'Total B/L charges': setInput('inp_bl_charges', row.rate); break;
						case 'Sea Way BL Charges': setInput('inp_sea_way_bl_charges', row.rate); break;
						case 'Any Other Charges': setInput('inp_cnf_other', row.rate); break;
					}
				});
			}

			if (data.sea_freight_details && data.sea_freight_details.length > 0) {
				console.log('Loading sea freight details:', data.sea_freight_details);
				data.sea_freight_details.forEach(row => {
					switch (row.freight_type) {
						case 'Sea Freight': setInput('inp_tc_sf_fcl', row.freight_rate); break;
						case 'Other Surcharge': setInput('inp_tc_sf_haz', row.freight_rate); break;
						case 'Vanning': setInput('inp_vanning_rs_fcl', row.freight_rate); break;
					}
				});
			}

			if (data.margin_analysis && data.margin_analysis.length > 0) {
				const margin = data.margin_analysis[0];
				setInput('inp_internal_cost_pct', margin.internal_cost_percentage);
				setInput('inp_doc_charges_usd', margin.document_charges_usd);
				setInput('inp_commission_val', margin.commission_value);
				setInput('inp_dbk_pct', margin.duty_drawback_percentage);
				setInput('inp_rodtep_pct', margin.rodtep_percentage);
			}

			// Trigger calculation after a delay to ensure all fields are populated and events processed
			setTimeout(() => {
				// Force re-set numeric fields that might not have stuck
				const numericFields = ['packing_unit_size', 'units_per_fcl', 'total_fcl'];
				numericFields.forEach(field => {
					if (data[field]) {
						const inputId = fieldMapping[field];
						const element = doc.getElementById(inputId);
						if (element && !element.value) {
							console.log(`Re-setting ${field} to ${data[field]}`);
							element.value = data[field];
							const inputEvent = new Event('input', { bubbles: true });
							element.dispatchEvent(inputEvent);
						}
					}
				});

				// Re-apply product grade after fetch_product_grade() may have overwritten it
				if (data.product_grade) {
					const gradeEl = doc.getElementById('inp_grade');
					if (gradeEl) {
						gradeEl.value = data.product_grade;
						gradeEl.dispatchEvent(new Event('change', { bubbles: true }));
						console.log('Re-applied product grade:', data.product_grade);
					}
				}

				// Apply deferred fields AFTER product change events have settled
				// (packing_type and std_packing get repopulated by iframe when product changes)
				// Apply deferred fields AFTER product change events have settled
				// ─── AFTER ───────────────────────────────────────────────────────────────
				// Step 1 @ 1500ms: apply packing_type first (NOT std_packing yet)
				const STD_PACKING_KEYS = ['std_packing', 'custom_std_pakcing'];

				Object.keys(deferredValues)
					.filter(docField => !STD_PACKING_KEYS.includes(docField))
					.forEach(docField => {
						const inputId = fieldMapping[docField];
						const element = doc.getElementById(inputId);
						if (!element) return;

						let valueToSet = deferredValues[docField];

						if (element.tagName === 'SELECT') {
							const normalizedVal = this.normalize_default_value(valueToSet);
							let optionExists = Array.from(element.options).some(
								opt => opt.value === valueToSet || opt.value === normalizedVal
							);
							if (!optionExists && normalizedVal !== valueToSet) {
								valueToSet = normalizedVal;
								optionExists = Array.from(element.options).some(opt => opt.value === valueToSet);
							}
							if (!optionExists) {
								const opt = doc.createElement('option');
								opt.value = valueToSet;
								opt.textContent = valueToSet;
								element.appendChild(opt);
							}
						}

						element.value = valueToSet;
						element.dispatchEvent(new Event('change', { bubbles: true }));
						console.log(`Applied deferred ${docField}: ${valueToSet} into ${inputId}`);
					});

				// Step 2 @ 1500+1000ms: apply std_packing AFTER packing_type's async
				// handlers (iframe option repopulation) have had time to settle
				const stdPackingDocField = STD_PACKING_KEYS.find(k => deferredValues[k] !== undefined);

				const applyStdPackingAndCalculate = () => {
					if (stdPackingDocField) {
						const inputId = fieldMapping[stdPackingDocField];
						const element = doc.getElementById(inputId);
						if (element) {
							let valueToSet = deferredValues[stdPackingDocField];

							if (element.tagName === 'SELECT') {
								const normalizedVal = this.normalize_default_value(valueToSet);
								let optionExists = Array.from(element.options).some(
									opt => opt.value === valueToSet || opt.value === normalizedVal
								);
								if (!optionExists && normalizedVal !== valueToSet) {
									valueToSet = normalizedVal;
									optionExists = Array.from(element.options).some(opt => opt.value === valueToSet);
								}
								if (!optionExists) {
									const opt = doc.createElement('option');
									opt.value = valueToSet;
									opt.textContent = valueToSet;
									element.appendChild(opt);
								}
							}

							element.value = valueToSet;
							element.dispatchEvent(new Event('change', { bubbles: true }));
							if (element.onchange) element.onchange();   // triggers fetchStdPackingWeight
							console.log(`Applied deferred std_packing (${stdPackingDocField}): ${valueToSet} into ${inputId}`);
						}
					}

					if (iframe.contentWindow && typeof iframe.contentWindow.calculateEngine === 'function') {
						console.log('Triggering calculateEngine after data load');
						iframe.contentWindow.calculateEngine();
					}
				};

				// Give packing_type's iframe handlers 1 second to finish async repopulation
				if (stdPackingDocField) {
					setTimeout(applyStdPackingAndCalculate, 1000);
				} else {
					applyStdPackingAndCalculate();
				}
			}, 1500);

			// Clear localStorage after loading
			localStorage.removeItem('cost_sheet_load_data');

			frappe.show_alert({
				message: __('Cost Sheet data loaded successfully'),
				indicator: 'green'
			}, 5);

		} catch (e) {
			console.error('Error loading cost sheet data:', e);
			frappe.msgprint({
				title: __('Error'),
				message: __('Failed to load Cost Sheet data. Please try again.'),
				indicator: 'red'
			});
		}
	}

	// ─────────────────────────────────────────────────────────────
	// HELPER
	// ─────────────────────────────────────────────────────────────

	get_iframe_select(doc, selectors) {
		for (let sel of selectors) {
			const $el = $(doc).find(sel);
			if ($el.length) return $el;
		}
		return $();
	}

	normalize_default_value(val) {
		if (!val) return "";
		const mapping = {
			"20' FCL": "20' FCL",
			"40' FCL": "40' FCL",
			"20' ISO": "20' ISO",
			"LCL": "LCL",
			"20'FT": "20' FCL",
			"40'FT": "40' FCL",
			"20'HC": "20' FCL",
			"20 FT": "20' FCL",
			"40 FT": "40' FCL",
			"40 HC": "40' FCL",
			"ISO Tank Container": "20' ISO",
			"Supplier's Place": "Supplier's Premises",
			"Supplier Premises": "Supplier's Premises",
			"Own Warehouse - Panoli": "Own Warehouse — Panoli",
			"Own Warehouse - Mundra": "Own Warehouse — Mundra",
			"IBC": "IBC Composite Pallet",
			"IBC Pallet": "IBC Composite Pallet",
			"1135 Kg New IBC Composite Pallet": "IBC Composite Pallet",
			"250 Kg HMHDPE Drums": "HMHDPE Drums",
			"50 Kg Bags on Pallets": "Bags",
		};
		return mapping[val] || val;
	}

	// ─────────────────────────────────────────────────────────────
	// POPULATE SELECT FROM DOCTYPE
	// Just fills options — does nothing else
	// ─────────────────────────────────────────────────────────────

	populate_select(doc, selectors, doctype, filters = {}) {
		const $sel = this.get_iframe_select(doc, selectors);
		if (!$sel.length) return;

		const fields = ['name'];
		if (doctype === 'Item') {
			fields.push('item_name');
		}

		frappe.db.get_list(doctype, {
			filters: filters,
			fields: fields,
			limit: 500,
			order_by: 'name asc'
		}).then(records => {
			if (!records || !Array.isArray(records)) return;

			const current_val = $sel.val();
			const normalized_current = this.normalize_default_value(current_val);

			// Check if current value is already in the list
			const current_in_list = records.some(r => r.name === current_val || r.name === normalized_current);

			const first_opt = $sel.find('option').first();
			const placeholder = (first_opt.val() === '' || !first_opt.val())
				? first_opt.text()
				: 'Select...';

			// Clear select safely using native DOM
			const selEl = $sel[0];
			selEl.innerHTML = '';

			// Append placeholder using iframe doc
			const optPlaceholder = doc.createElement('option');
			optPlaceholder.value = '';
			optPlaceholder.textContent = placeholder;
			selEl.appendChild(optPlaceholder);

			let has_selection = false;

			// If current value exists but not in list, add it first
			if (current_val && !current_in_list) {
				const opt = doc.createElement('option');
				opt.value = current_val;
				opt.textContent = current_val;
				opt.selected = true;
				selEl.appendChild(opt);
				has_selection = true;
				if (doctype === 'Item') {
					frappe.call({
						method: 'frappe.client.get_value',
						args: {
							doctype: 'Item',
							filters: { name: current_val },
							fieldname: 'item_name'
						},
						callback: function (r) {
							if (r.message && r.message.item_name) {
								opt.textContent = r.message.item_name;
							}
						}
					});
				}
			}

			records.forEach(row => {
				const is_selected = !has_selection && (row.name === current_val || row.name === normalized_current);
				if (is_selected) has_selection = true;

				const opt = doc.createElement('option');
				opt.value = row.name;
				opt.textContent = doctype === 'Item' ? (row.item_name || row.name) : row.name;
				if (is_selected) {
					opt.selected = true;
				}
				selEl.appendChild(opt);
			});

			// Trigger change only if there was a selection to maintain
			if (has_selection && current_val) {
				$sel.trigger('change');
			}
		}).catch(console.error);
	}

	// ─────────────────────────────────────────────────────────────
	// DYNAMIC SELECT OPTIONS FROM DOCTYPE FIELDS
	// ─────────────────────────────────────────────────────────────

	populate_select_from_field(doc, selectors, fieldname) {
		const $sel = this.get_iframe_select(doc, selectors);
		if (!$sel.length) return;

		const current_val = $sel.val();
		const normalized_current = this.normalize_default_value(current_val);
		const first_opt = $sel.find('option').first();
		const placeholder = (first_opt.val() === '' || !first_opt.val())
			? first_opt.text()
			: 'Select...';

		// Hardcoded options from Cost Sheet DocType JSON (must stay in sync with doctype)
		const field_options = {
			'container_type': [
				'20\' FCL',
				'40\' FCL',
				'20\' ISO',
				'LCL'
			],
			'packing_type': [
				'Bags',
				'Drums',
				'Cartons',
				'Bulk',
				'Pallets',
				'Jumbo Bags',
				'IBC Composite Pallet',
				'HMHDPE Drums'
			]
		};

		const options = field_options[fieldname] || [];

		// Clear select safely using native DOM
		const selEl = $sel[0];
		selEl.innerHTML = '';

		// Append placeholder using iframe doc
		const optPlaceholder = doc.createElement('option');
		optPlaceholder.value = '';
		optPlaceholder.textContent = placeholder;
		selEl.appendChild(optPlaceholder);

		let has_selection = false;
		options.forEach(opt => {
			const is_selected = (opt === current_val || opt === normalized_current);
			if (is_selected) has_selection = true;

			const optEl = doc.createElement('option');
			optEl.value = opt;
			optEl.textContent = opt;
			if (is_selected) {
				optEl.selected = true;
			}
			selEl.appendChild(optEl);
		});

		if (has_selection) {
			$sel.trigger('change');
		}
	}

	// ─────────────────────────────────────────────────────────────
	// DYNAMIC LINK FIELDS
	// Populates dropdowns from Frappe doctypes and select options
	// ─────────────────────────────────────────────────────────────

	setup_dynamic_link_fields(iframe) {
		try {
			const doc = iframe.contentDocument || iframe.contentWindow.document;

			// Populate Link fields from DocTypes
			this.populate_select(doc,
				['#inp_customer', 'select[id*="customer"]'],
				'Customer'
			);

			this.populate_select(doc,
				['#inp_supplier', 'select[id*="supplier"]'],
				'Supplier'
			);

			this.populate_select(doc,
				['#inp_destination', 'select[id*="destination"]'],
				'Port of Destinations'
			);

			this.populate_select(doc,
				['#inp_product', 'select[id*="product"]'],
				'Item'
			);

			this.populate_select(doc,
				['#inp_pod', 'select[id*="pod"]'],
				'Port of Discharge'
			);

			this.populate_select(doc,
				['#inp_pol', 'select[id*="pol"]'],
				'Port of Loading'
			);

			// Product Grade will be populated based on selected Product
			// Setup change event on product field
			const $product = this.get_iframe_select(doc, ['#inp_product', 'select[id*="product"]']);
			$product.on('change', (e) => {
				this.fetch_product_grade(doc, e.target.value);
			});

			// Exchange Rate will be populated based on selected Currency
			// Setup change event on currency field
			const $currency = this.get_iframe_select(doc, ['#inp_currency', 'select[id*="currency"]', 'input[id*="currency"]']);
			$currency.on('change', (e) => {
				this.fetch_exchange_rate(doc, e.target.value);
			});

			// Populate Cost Sheet Currency from Currency doctype
			this.populate_select(doc,
				['#inp_cs_currency', 'select[id*="cs_currency"]'],
				'Currency',
			);

			// Setup change event on cost sheet currency to fetch exchange rate
			const $cs_currency = this.get_iframe_select(doc, ['#inp_cs_currency', 'select[id*="cs_currency"]']);
			$cs_currency.on('change', (e) => {
				this.fetch_exchange_rate(doc, e.target.value);
			});

			// Packing Type is populated dynamically by the iframe based on the selected Item
			// and its custom_packing_type child table. We do NOT populate it here to avoid overwriting the filtered options.

			// Std. Packing should load all Standard Packing options
			this.populate_select(doc,
				['#inp_std_packing', 'select[id*="std_packing"]'],
				'Standard Packing'
			);

			// Port of Discharge is a Data field — no doctype link, no population needed

			this.populate_select(doc,
				['#inp_shipping_line', 'select[id*="shipping_line"]'],
				'Preferred Shipping Line'
			);

			// Populate Select fields with hardcoded options from Cost Sheet DocType
			// Note: stuffing_at is NOT populated here - it has only 2 options in HTML and handles dynamic location population

			this.populate_select_from_field(doc,
				['#inp_container', 'select[id*="container"]'],
				'container_type'
			);

			// Link Customer Payment Terms and Supplier Payment Terms to Payment Terms Template
			this.populate_select(doc,
				['#inp_supp_terms', 'select[id*="supp_terms"]'],
				'Payment Terms Template'
			);

			this.populate_select(doc,
				['#inp_cust_terms', 'select[id*="cust_terms"]'],
				'Payment Terms Template'
			);

			// Company — auto-detect from frappe.defaults first, then populate select
			const companyEl = doc.getElementById('inp_company');
			if (companyEl) {
				const defaultCompany = frappe.defaults && frappe.defaults.get_user_default('Company');
				if (defaultCompany) {
					companyEl.value = defaultCompany;
				} else {
					// Fallback: fetch first company from list
					frappe.call({
						method: 'frappe.client.get_list',
						args: { doctype: 'Company', fields: ['name'], limit_page_length: 1, order_by: 'name asc' },
						callback: (r) => {
							if (r.message && r.message.length) {
								companyEl.value = r.message[0].name;
							}
						}
					});
				}
			}

		} catch (e) {
			console.error('Dynamic link field setup error:', e);
		}
	}

	// ─────────────────────────────────────────────────────────────
	// FETCH PRODUCT GRADE FROM ITEM
	// ─────────────────────────────────────────────────────────────

	fetch_product_grade(doc, item_name) {
		if (!item_name) {
			// Clear the grade field if no product selected
			const $grade = this.get_iframe_select(doc, ['#inp_grade', 'input[id*="grade"]']);
			$grade.val('');
			return;
		}

		// Fetch custom_item_grade from Item (e.g. "64%"), fall back to parent variant
		frappe.call({
			method: 'frappe.client.get_value',
			args: {
				doctype: 'Item',
				filters: { name: item_name },
				fieldname: ['custom_item_grade', 'variant_of', 'item_name']
			},
			callback: (r) => {
				if (!r.message) return;
				const grade = r.message.custom_item_grade || '';
				const parentItem = r.message.variant_of || '';

				const setGrade = (val) => {
					const $grade = this.get_iframe_select(doc, ['#inp_grade', 'input[id*="grade"]']);
					if ($grade.length) {
						$grade.val(val);
						$grade.trigger('change');
					}
				};

				if (grade) {
					setGrade(grade);
				} else if (parentItem) {
					// Variant item — fetch grade from parent template
					frappe.call({
						method: 'frappe.client.get_value',
						args: {
							doctype: 'Item',
							filters: { name: parentItem },
							fieldname: ['custom_item_grade']
						},
						callback: (rp) => {
							setGrade((rp.message || {}).custom_item_grade || '');
						}
					});
				}
			}
		});
	}

	// ─────────────────────────────────────────────────────────────
	// FETCH EXCHANGE RATE FROM CURRENCY EXCHANGE
	// ─────────────────────────────────────────────────────────────

	// Fix fetch_exchange_rate — correct the target field ID from inp_exchange_rate → inp_base_rate
	fetch_exchange_rate(doc, from_currency) {
		if (!from_currency) {
			const $rate = this.get_iframe_select(doc, ['#inp_base_rate']);
			$rate.val('');
			return;
		}

		if (from_currency === 'INR') {
			const $rate = this.get_iframe_select(doc, ['#inp_base_rate']);
			if ($rate.length) {
				$rate.val('1.0000');
				$rate.trigger('input');
			}
			// Update status label directly — no iframeWin.$ needed
			const statusEl = doc.getElementById('lbl-rate-fetch-status');
			if (statusEl) {
				statusEl.textContent = '✓ INR selected — rate set to 1.0000';
				statusEl.style.color = '#10B981';
			}
			return;
		}

		// Show fetching indicator
		const statusEl = doc.getElementById('lbl-rate-fetch-status');
		const btnEl = doc.getElementById('btn_fetch_rate');
		if (statusEl) { statusEl.textContent = '⏳ Fetching rate...'; statusEl.style.color = '#6B7280'; }
		if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Fetching'; }

		frappe.call({
			method: 'frappe.client.get_list',
			args: {
				doctype: 'Currency Exchange',
				filters: {
					from_currency: from_currency,
					to_currency: 'INR'
				},
				fields: ['exchange_rate', 'date'],
				order_by: 'date desc',
				limit_page_length: 1
			},
			callback: (r) => {
				if (btnEl) { btnEl.disabled = false; btnEl.textContent = '↻ Fetch'; }

				if (r.message && r.message.length > 0) {
					const rate = r.message[0].exchange_rate;
					const $rate = this.get_iframe_select(doc, ['#inp_base_rate']);
					if ($rate.length) {
						$rate.val(parseFloat(rate).toFixed(4));
						$rate.trigger('input');  // fires calculateEngine() in iframe
					}
					// Use doc.getElementById directly — no iframeWin.$ needed
					if (statusEl) {
						statusEl.textContent = `✓ Rate fetched: 1 ${from_currency} = ${parseFloat(rate).toFixed(4)} INR`;
						statusEl.style.color = '#10B981';
					}
				} else {
					if (statusEl) {
						statusEl.textContent = `No rate found for ${from_currency}→INR. Enter manually.`;
						statusEl.style.color = '#EF4444';
					}
					frappe.msgprint({
						title: __('Exchange Rate Not Found'),
						indicator: 'orange',
						message: __(`No Currency Exchange record found for ${from_currency} → INR. Please enter manually or add it in Currency Exchange doctype.`)
					});
				}
			},
			error: () => {
				if (btnEl) { btnEl.disabled = false; btnEl.textContent = '↻ Fetch'; }
				if (statusEl) { statusEl.textContent = 'Fetch failed. Enter rate manually.'; statusEl.style.color = '#EF4444'; }
			}
		});
	}

	// ─────────────────────────────────────────────────────────────
	// DYNAMIC REQUIRED FIELDS
	// ─────────────────────────────────────────────────────────────
	setup_dynamic_required_fields(iframe) {
		const doc = iframe.contentDocument || iframe.contentWindow.document;

		// Add CSS once
		if (!doc.getElementById("required-style")) {
			const style = doc.createElement("style");
			style.id = "required-style";
			style.innerHTML = `
				.required-empty{
					border:1px solid #ef4444 !important;
					box-shadow:none !important;
				}

				.req-marker{
					color:#ef4444;
					font-weight:bold;
					margin-left:4px;
				}
			`;
			doc.head.appendChild(style);
		}

		const refreshFieldState = (field) => {
			if (!field) return;

			const required = field.dataset.required === "1";

			if (!required) return;

			const value = (field.value || "").trim();

			const formGroup = field.closest(".form-group");
			const label = formGroup ? formGroup.querySelector("label") : null;

			let marker = label
				? label.querySelector(".req-marker")
				: null;

			if (!value) {

				field.classList.add("required-empty");

				if (label && !marker) {
					// marker = document.createElement("span");
					marker = doc.createElement("span");
					marker.className = "req-marker";
					marker.innerHTML = "*";
					label.appendChild(marker);
				}

			} else {
				field.classList.remove("required-empty");
				field.style.border = "";
				field.style.boxShadow = "";

				// field.classList.remove("required-empty");

				if (marker) {
					marker.remove();
				}
			}
		};

		// All mandatory fields
		const mandatory_fields = [
			"inp_user_incoterm",
			"inp_user_origin",
			"inp_product",
			"inp_customer",
			"inp_cust_terms",
			"inp_pol",
			"inp_stuffing_at",
			"inp_unit_size",
			"inp_total_fcl",
			"inp_cs_currency",
			"inp_base_rate",
			"inp_packing_type"
		];

		mandatory_fields.forEach(fieldname => {

			const field = doc.getElementById(fieldname);

			if (!field) return;

					field.dataset.required = "1";
					if (fieldname === "inp_customer") {

				const lead = doc.getElementById("inp_lead");
				const prospect = doc.getElementById("inp_prospect");

				const hasLead =
					lead &&
					String(lead.value || "").trim();

				const hasProspect =
					prospect &&
					String(prospect.value || "").trim();

				if (hasLead || hasProspect) {
					return;
				}
			}

			field.dataset.required = "1";

			field.removeEventListener("change", field._requiredHandler);
			field.removeEventListener("input", field._requiredHandler);

			field._requiredHandler = () => {
				refreshFieldState(field);
			};

			field.addEventListener("change", field._requiredHandler);
			field.addEventListener("input", field._requiredHandler);

			refreshFieldState(field);
		});
	}

	apply_required_fields(doc, rule_name) {
		$(doc).find(".dynamic-required").removeClass("dynamic-required");
		$(doc).find(".required-star").remove();
		$(doc).find("[required]").removeAttr("required");

		let fields = this.required_rules[rule_name] || [];

		// If lead or prospect is populated, customer is not mandatory
		const hasLead = !!$(doc).find("#inp_lead").val();
		const hasProspect = !!$(doc).find("#inp_prospect").val();
		if (hasLead || hasProspect) {
			fields = fields.filter(f => f !== "customer");
		}

		fields.forEach(field => {
			const $field = this.get_iframe_select(doc, [
				`[name="${field}"]`, `#${field}`,
				`input[id*="${field}"]`, `select[id*="${field}"]`
			]);

			if (!$field.length) return;

			$field.attr("required", true).addClass("dynamic-required");

			const $label = $field.closest(".form-group").find("label");
			if ($label.length && !$label.find(".required-star").length) {
				$label.append(`<span class="required-star" style="color:red;margin-left:3px">*</span>`);
			}
		});

		this.add_required_styles(doc);
	}

	add_required_styles(doc) {
		if ($(doc).find("#required-style").length) return;
		$(doc.head).append(`
			<style id="required-style">
				.dynamic-required { border-color: #ff5858 !important; }
				.dynamic-required:invalid { border-color: #ff5858 !important; box-shadow: none !important; }
			</style>
		`);
	}
	validate_dynamic_required(iframe) {

			const doc = iframe.contentDocument || iframe.contentWindow.document;

			let valid = true;
			let firstInvalid = null;
			let missing = [];

			doc.querySelectorAll("[data-required='1']").forEach(field => {

				// Skip hidden fields
				if (
					field.offsetParent === null ||
					field.closest('[style*="display:none"]')
				) {
					return;
				}

				const value = field.value;

				const hasValue =
					value !== null &&
					value !== undefined &&
					String(value).trim() !== "";

				if (!hasValue) {

					valid = false;

					field.classList.add("required-empty");

					missing.push(field.id);

					if (!firstInvalid) {
						firstInvalid = field;
					}
				}
			});

			console.log("Missing Fields:", missing);

			if (!valid) {

				frappe.msgprint({
					title: __("Mandatory Fields"),
					indicator: "red",
					message:
						__("Missing Fields") +
						"<br><br>" +
						missing.join("<br>")
				});

				return false;
			}

			return true;
		}
}