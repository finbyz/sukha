// frappe.pages['cost-sheet-dashboard'].on_page_load = function(wrapper) {
// 	new CostSheetDashboard(wrapper);
// };

// class CostSheetDashboard {
// 	constructor(wrapper) {
// 		this.page = frappe.ui.make_app_page({
// 			parent: wrapper,
// 			title: 'Cost Sheet Engine',
// 			single_column: true
// 		});

// 		this.wrapper = $(wrapper);
// 		this.page_content = this.wrapper.find('.page-content');

// 		this.setup_page();
// 		this.render_html();
// 	}

// 	setup_page() {
// 		// Add primary action button
// 		this.page.set_primary_action('Save Cost Sheet', () => {
// 			this.save_cost_sheet();
// 		}, 'octicon octicon-check');

// 		// Add secondary actions
// 		this.page.add_menu_item('New Cost Sheet', () => {
// 			this.reset_form();
// 		});

// 		this.page.add_menu_item('Load Existing', () => {
// 			this.show_cost_sheet_selector();
// 		});

// 		// Add search field in the page
// 		this.setup_search();
// 	}

// 	setup_search() {
// 		// Create search input in the page
// 		const search_html = `
// 			<div class="form-group" style="margin: 0; min-width: 300px;">
// 				<input type="text" 
// 					class="form-control" 
// 					id="cost-sheet-search" 
// 					placeholder="Search in form fields..."
// 					style="padding: 6px 12px; font-size: 13px;">
// 			</div>
// 		`;

// 		// Add to page header
// 		$(this.page.wrapper).find('.page-head-content .standard-actions').prepend(search_html);

// 		// Setup search functionality
// 		let search_timeout;
// 		$('#cost-sheet-search').on('input', (e) => {
// 			clearTimeout(search_timeout);
// 			search_timeout = setTimeout(() => {
// 				this.search_in_form(e.target.value);
// 			}, 300);
// 		});
// 	}

// 	search_in_form(query) {
// 		const iframe = document.getElementById('cost-sheet-iframe');
// 		if (!iframe || !iframe.contentWindow) return;

// 		try {
// 			const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

// 			// Remove previous highlights
// 			$(iframeDoc).find('.search-highlight').removeClass('search-highlight');

// 			if (!query || query.length < 2) return;

// 			// Search in all form inputs, selects, and labels
// 			const searchableElements = $(iframeDoc).find('input, select, textarea, label, .rp-summary-val, .kpi-box-val');

// 			searchableElements.each(function() {
// 				const $el = $(this);
// 				let text = '';

// 				if ($el.is('input, select, textarea')) {
// 					text = $el.val() || '';
// 				} else {
// 					text = $el.text() || '';
// 				}

// 				if (text.toLowerCase().includes(query.toLowerCase())) {
// 					// Highlight the element or its parent
// 					if ($el.is('input, select, textarea')) {
// 						$el.addClass('search-highlight');
// 					} else {
// 						$el.closest('.form-group, .kb-stat, .section-card').addClass('search-highlight');
// 					}

// 					// Scroll to first match
// 					if ($(iframeDoc).find('.search-highlight').length === 1) {
// 						$el[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
// 					}
// 				}
// 			});

// 			// Add highlight CSS if not exists
// 			if (!$(iframeDoc).find('#search-highlight-style').length) {
// 				$(iframeDoc.head).append(`
// 					<style id="search-highlight-style">
// 						.search-highlight {
// 							background-color: #FEF3C7 !important;
// 							border: 2px solid #F59E0B !important;
// 							border-radius: 4px;
// 							transition: all 0.3s;
// 						}
// 					</style>
// 				`);
// 			}

// 		} catch (e) {
// 			console.error('Search error:', e);
// 		}
// 	}

// 	render_html() {
// 		// Load the complete cost sheet HTML via iframe
// 		this.page_content.html(`
// 			<div style="width: 100%; height: calc(100vh - 100px); overflow: hidden;">
// 				<iframe 
// 					src="/cost_sheet" 
// 					style="width: 100%; height: 100%; border: none;"
// 					id="cost-sheet-iframe"
// 				></iframe>
// 			</div>
// 		`);

// 		// Setup communication with iframe
// 		this.setup_iframe_communication();

// 		// Wait for iframe to load
// 		const iframe = document.getElementById('cost-sheet-iframe');
// 		if (iframe) {
// 			iframe.onload = () => {
// 				console.log('Cost sheet iframe loaded successfully');
// 				// Make save function accessible
// 				this.iframe_loaded = true;
// 			};
// 		}
// 	}

// 	setup_iframe_communication() {
// 		// Listen for messages from the iframe
// 		window.addEventListener('message', (event) => {
// 			if (event.data.type === 'save_cost_sheet') {
// 				this.save_cost_sheet_from_iframe(event.data.data);
// 			}
// 		});
// 	}

// 	save_cost_sheet_from_iframe(data) {
// 		frappe.call({
// 			method: 'sukha.sukha.doctype.cost_sheet.cost_sheet.create_from_dashboard',
// 			args: { data: data },
// 			callback: (r) => {
// 				if (r.message) {
// 					frappe.msgprint(__('Cost Sheet saved successfully'));
// 					frappe.set_route('Form', 'Cost Sheet', r.message);
// 				}
// 			}
// 		});
// 	}

// 	save_cost_sheet() {
// 		// Get the iframe
// 		const iframe = document.getElementById('cost-sheet-iframe');
// 		if (!iframe) {
// 			frappe.msgprint(__('Cost sheet form not loaded. Please refresh the page.'));
// 			return;
// 		}

// 		// Wait for iframe to be fully loaded
// 		if (!iframe.contentWindow) {
// 			frappe.msgprint(__('Cost sheet form is still loading. Please wait a moment and try again.'));
// 			return;
// 		}

// 		try {
// 			// Check if the function exists in iframe
// 			if (typeof iframe.contentWindow.saveCostSheet === 'function') {
// 				// Call the saveCostSheet function inside the iframe
// 				iframe.contentWindow.saveCostSheet();
// 			} else {
// 				// Fallback: wait a bit and try again
// 				setTimeout(() => {
// 					if (typeof iframe.contentWindow.saveCostSheet === 'function') {
// 						iframe.contentWindow.saveCostSheet();
// 					} else {
// 						frappe.msgprint(__('Cost sheet form not ready. Please refresh the page and try again.'));
// 					}
// 				}, 500);
// 			}
// 		} catch (e) {
// 			console.error('Error calling saveCostSheet:', e);
// 			frappe.msgprint({
// 				title: __('Error'),
// 				indicator: 'red',
// 				message: __('Unable to save cost sheet. Error: ' + e.message)
// 			});
// 		}
// 	}

// 	reset_form() {
// 		// Reload the iframe to reset the form
// 		const iframe = document.getElementById('cost-sheet-iframe');
// 		if (iframe) {
// 			iframe.src = iframe.src;
// 		}
// 	}

// 	show_cost_sheet_selector() {
// 		new frappe.ui.form.MultiSelectDialog({
// 			doctype: 'Cost Sheet',
// 			target: this,
// 			setters: {
// 				cost_sheet_type: null,
// 				status: null
// 			},
// 			action(selections) {
// 				if (selections && selections.length > 0) {
// 					frappe.set_route('Form', 'Cost Sheet', selections[0]);
// 				}
// 			}
// 		});
// 	}
// 	// ─────────────────────────────────────────────────────────────
// 	// DYNAMIC REQUIRED FIELDS (NEW)
// 	// ─────────────────────────────────────────────────────────────

// 	setup_dynamic_required_fields(iframe) {
// 		try {
// 			const doc = iframe.contentDocument || iframe.contentWindow.document;

// 			// Required field rules
// 			// Add/remove fields here only
// 			this.required_rules = {
// 				"Domestic": [
// 					"product_name",
// 					"customer_name",
// 					"delivery_location",
// 					"packing_type",
// 					"packing_unit_size",
// 					"total_fcl"
// 				],

// 				"Export": [
// 					"product_name",
// 					"customer_name",
// 					"loading_location",
// 					"supplier_name",
// 					"packing_type",
// 					"packing_unit_size",
// 					"total_fcl"
// 				]
// 			};

// 			// Type of Sale selector
// 			const $sale_type = this.get_iframe_select(doc, [
// 				'#type-of-sale',
// 				'[name="type_of_sale"]',
// 				'select[id*="sale"]'
// 			]);

// 			// Initial load
// 			this.apply_required_fields(
// 				doc,
// 				$sale_type.val() || "Domestic"
// 			);

// 			// Dynamic change
// 			$sale_type.on("change", (e) => {
// 				this.apply_required_fields(
// 					doc,
// 					e.target.value
// 				);
// 			});

// 		} catch(e) {
// 			console.error("Dynamic required setup:", e);
// 		}
// 	}


// 	// Apply required rules
// 	apply_required_fields(doc, rule_name) {

// 		// Remove previous required
// 		$(doc).find(".dynamic-required").removeClass("dynamic-required");
// 		$(doc).find("[required]").removeAttr("required");

// 		const fields = this.required_rules[rule_name] || [];

// 		fields.forEach(field => {

// 			let $field = this.get_iframe_select(doc, [
// 				`[name="${field}"]`,
// 				`#${field}`,
// 				`input[id*="${field}"]`,
// 				`select[id*="${field}"]`
// 			]);

// 			// Try input if select not found
// 			if (!$field.length) {
// 				$field = $(doc).find(
// 					`input[name="${field}"],
// 					textarea[name="${field}"]`
// 				);
// 			}

// 			if (!$field.length) return;

// 			$field.attr("required", true);
// 			$field.addClass("dynamic-required");

// 			// Add red star beside label
// 			const label = $field
// 				.closest(".form-group")
// 				.find("label");

// 			if (
// 				label.length &&
// 				!label.find(".required-star").length
// 			) {
// 				label.append(
// 					`<span class="required-star"
// 					style="color:red;margin-left:3px">*</span>`
// 				);
// 			}
// 		});

// 		this.add_required_styles(doc);
// 	}


// 	// Required styling only
// 	add_required_styles(doc){

// 		if($(doc).find("#required-style").length)
// 			return;

// 		$(doc.head).append(`
// 		<style id="required-style">

// 		.dynamic-required{
// 			border-color:#ff5858 !important;
// 		}

// 		.dynamic-required:invalid{
// 			border-color:#ff5858 !important;
// 			box-shadow:none !important;
// 		}

// 		</style>
// 		`);
// 	}


// 	// Validate before save
// 	validate_dynamic_required(iframe){

// 		const doc = iframe.contentDocument || iframe.contentWindow.document;

// 		let missing=[];

// 		$(doc).find("[required]").each(function(){

// 			const val=$(this).val();

// 			if(!val || !String(val).trim()){
// 				const label=$(this)
// 					.closest(".form-group")
// 					.find("label")
// 					.text()
// 					.trim();

// 				missing.push(
// 					label || $(this).attr("name")
// 				);
// 			}
// 		});

// 		if(missing.length){

// 			frappe.msgprint({
// 				title:"Missing Required Fields",
// 				indicator:"red",
// 				message:missing.join("<br>")
// 			});

// 			return false;
// 		}

// 		return true;
// 	}
// }




frappe.pages['cost-sheet-dashboard'].on_page_load = function (wrapper) {
	new CostSheetDashboard(wrapper);
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
			<div style="width: 100%; height: calc(100vh - 100px); overflow: hidden;">
				<iframe
					src="/cost_sheet"
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
			};
		}
	}

	setup_iframe_communication() {
		window.addEventListener('message', (event) => {
			if (event.data.type === 'save_cost_sheet') {
				this.save_cost_sheet_from_iframe(event.data.data);
			}
			// Product grade fetch request from iframe
			if (event.data.type === 'fetch_product_grade') {
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				// First try direct fetch using custom_item_grade
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Item',
						filters: { name: event.data.item },
						fieldname: ['custom_item_grade', 'variant_of']
					},
					callback: (r) => {
						const grade = (r.message || {}).custom_item_grade || '';
						const parentItem = (r.message || {}).variant_of || '';

						if (grade) {
							iframe.contentWindow.postMessage({ type: 'product_grade_response', grade }, '*');
						} else if (parentItem) {
							// Variant — check parent template
							frappe.call({
								method: 'frappe.client.get_value',
								args: {
									doctype: 'Item',
									filters: { name: parentItem },
									fieldname: ['custom_item_grade']
								},
								callback: (rp) => {
									const parentGrade = (rp.message || {}).custom_item_grade || '';
									iframe.contentWindow.postMessage(
										{ type: 'product_grade_response', grade: parentGrade },
										'*'
									);
								}
							});
						} else {
							iframe.contentWindow.postMessage({ type: 'product_grade_response', grade: '' }, '*');
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
		});
	}

	save_cost_sheet_from_iframe(data) {
		frappe.call({
			method: 'sukha.sukha.doctype.cost_sheet.cost_sheet.create_from_dashboard',
			args: { data: data },
			callback: (r) => {
				if (r.message) {
					frappe.msgprint(__('Cost Sheet saved successfully'));
					frappe.set_route('Form', 'Cost Sheet', r.message);
				}
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
		new frappe.ui.form.MultiSelectDialog({
			doctype: 'Cost Sheet',
			target: this,
			setters: {
				cost_sheet_type: null,
				status: null
			},
			action(selections) {
				if (selections && selections.length > 0) {
					frappe.set_route('Form', 'Cost Sheet', selections[0]);
				}
			}
		});
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
			// Container type: old HTML values → doctype values
			"20 FCL": "20 FT",
			"40 FCL": "40 FT",
			"40 HC": "40 HC",
			"ISO Tank": "ISO Tank Container",
			// Stuffing at: old warehouse names → doctype values
			"Sukha- Panoli Warehouse": "Own Warehouse \u2014 Panoli",
			"Sukha- Mundra Warehouse": "Own Warehouse \u2014 Mundra",
			// Packing type: old descriptive → doctype short names
			"1135 Kg New IBC Composite Pallet": "IBC Composite Pallet",
			"250 Kg HMHDPE Drums": "HMHDPE Drums",
			"50 Kg Bags on Pallets": "Bags",
			// Payment terms: numeric → keep as-is (matched by Payment Terms Template name)
			"30": "30 Days Credit",
			"60": "60 Days Credit",
			"90": "90 Days Credit",
			"0": "LC at Sight"
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

		frappe.db.get_list(doctype, {
			filters: filters,
			fields: ['name'],
			limit: 500,
			order_by: 'name asc'
		}).then(records => {
			if (!records || !Array.isArray(records)) return;

			const current_val = $sel.val();
			const normalized_current = this.normalize_default_value(current_val);
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
			records.forEach(row => {
				const is_selected = (row.name === current_val || row.name === normalized_current);
				if (is_selected) has_selection = true;
				
				const opt = doc.createElement('option');
				opt.value = row.name;
				opt.textContent = row.name;
				if (is_selected) {
					opt.selected = true;
				}
				selEl.appendChild(opt);
			});

			if (has_selection) {
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
			'stuffing_at': [
				"Supplier's Place",
				'Own Warehouse \u2014 Panoli',
				'Own Warehouse \u2014 Mundra',
				'CFS / ICD'
			],
			'container_type': [
				'20 FT',
				'40 FT',
				'40 HC',
				'ISO Tank Container'
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
				'Country'
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

			// // Packing Type - now using select options instead of DocType link
			// this.populate_select_from_field(doc,
			// 	['#inp_packing_type', 'select[id*="packing_type"]'],
			// 	'packing_type'
			// );
			this.populate_select(doc,
				['#inp_packing_type', 'select[id*="packing_type"]'],
				'Packing Type'
			);

			// Port of Discharge is a Data field — no doctype link, no population needed

			this.populate_select(doc,
				['#inp_shipping_line', 'select[id*="shipping_line"]'],
				'Preferred Shipping Line'
			);

			// Populate Select fields with hardcoded options from Cost Sheet DocType
			this.populate_select_from_field(doc,
				['#inp_stuffing_at', 'select[id*="stuffing_at"]'],
				'stuffing_at'
			);

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
		try {
			const doc = iframe.contentDocument || iframe.contentWindow.document;

			this.required_rules = {
				"Domestic": [
					"product_name", "customer_name", "delivery_location",
					"packing_type", "packing_unit_size", "total_fcl"
				],
				"Export": [
					"product_name", "customer_name", "loading_location",
					"supplier_name", "packing_type", "packing_unit_size", "total_fcl"
				],
				"Direct Export": [
					"product_name", "customer_name", "loading_location",
					"supplier_name", "packing_type", "packing_unit_size", "total_fcl"
				]
			};

			const $sale_type = this.get_iframe_select(doc, [
				'#type-of-sale', '[name="type_of_sale"]', 'select[id*="sale"]'
			]);

			this.apply_required_fields(doc, $sale_type.val() || "Domestic");

			$sale_type.on("change", (e) => {
				this.apply_required_fields(doc, e.target.value);
			});

		} catch (e) {
			console.error("Dynamic required setup error:", e);
		}
	}

	apply_required_fields(doc, rule_name) {
		$(doc).find(".dynamic-required").removeClass("dynamic-required");
		$(doc).find(".required-star").remove();
		$(doc).find("[required]").removeAttr("required");

		const fields = this.required_rules[rule_name] || [];

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
		let missing = [];

		$(doc).find("[required]").each(function () {
			const val = $(this).val();
			if (!val || !String(val).trim()) {
				const label = $(this).closest(".form-group").find("label")
					.text().replace("*", "").trim();
				missing.push(label || $(this).attr("name"));
			}
		});

		if (missing.length) {
			frappe.msgprint({
				title: __("Missing Required Fields"),
				indicator: "red",
				message: missing.map(f => `• ${f}`).join("<br>")
			});
			return false;
		}

		return true;
	}
}