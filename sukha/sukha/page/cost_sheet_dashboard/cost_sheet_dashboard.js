frappe.pages['cost-sheet-dashboard'].on_page_load = function (wrapper) {
	wrapper.cost_sheet_dashboard = new CostSheetDashboard(wrapper);
};

frappe.pages['cost-sheet-dashboard'].on_page_show = function (wrapper) {
	if (wrapper.cost_sheet_dashboard) {
		const dashboard = wrapper.cost_sheet_dashboard;
		const route_context_key = dashboard.get_route_context_key();
		const iframe = document.getElementById('cost-sheet-iframe');

		if (route_context_key && iframe && dashboard.iframe_loaded && route_context_key !== dashboard.last_route_context_key) {
			dashboard.last_route_context_key = route_context_key;
			dashboard.current_cost_sheet_doc = null;
			dashboard.sync_iframe_readonly_state();
			dashboard.source_context = null;
			dashboard.pending_load_data = null;
			dashboard.set_iframe_doc_name(null);
			dashboard.render_actions();

			const page_content = dashboard.page_content;
			if (!page_content.find('#loading-overlay').length) {
				page_content.find('> div').prepend(`
					<div id="loading-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; z-index: 1000;">
						<div style="text-align: center;">
							<div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
								<span class="sr-only">Loading...</span>
							</div>
							<p style="margin-top: 15px; color: #6c757d;">Loading Cost Sheet...</p>
						</div>
					</div>
				`);
			}

			iframe.src = `/cost_sheet?v=${Date.now()}`;
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
		this.current_cost_sheet_doc = null;
		this.is_dirty = false;
		this.suppress_dirty = false;
		this.workflow_refresh_id = 0;
		this.workflow_actions_loading = false;
		this.active_workflow = null;
		this.source_context = null;
		this.pending_load_data = null;
		this.last_route_context_key = null;

		this.setup_page();
		this.render_html();
	}

	setup_page() {
		this.render_actions();
		this.page.add_menu_item('New Cost Sheet', () => {
			this.reset_form();
		});

		this.page.add_menu_item('Load Existing', () => {
			this.show_cost_sheet_selector();
		});

		this.setup_search();
	}

	get_route_params() {
		const params = new URLSearchParams(window.location.search || '');
		const hash = window.location.hash || '';
		const hash_query_index = hash.indexOf('?');

		if (hash_query_index !== -1) {
			const hash_params = new URLSearchParams(hash.slice(hash_query_index + 1));
			hash_params.forEach((value, key) => {
				if (!params.has(key)) {
					params.set(key, value);
				}
			});
		}

		return {
			source_doctype: params.get('source_doctype') || '',
			source_name: params.get('source_name') || '',
			incoterm: params.get('incoterm') || '',
			origin_scope: params.get('origin_scope') || '',
			exw_sub_type: params.get('exw_sub_type') || ''
		};
	}

	has_route_context() {
		const params = this.get_route_params();
		return Boolean(params.source_doctype && params.source_name);
	}

	get_route_context_key() {
		const params = this.get_route_params();
		if (!params.source_doctype || !params.source_name) return '';

		return JSON.stringify(params);
	}

	replace_dashboard_route(params = {}) {
		const query = new URLSearchParams(params).toString();
		const url = query ? `/app/cost-sheet-dashboard?${query}` : '/app/cost-sheet-dashboard';
		window.history.replaceState(null, '', url);
		this.last_route_context_key = this.get_route_context_key();
	}

	build_cost_sheet_data_from_opportunity(opportunity, params = {}) {
		const incoterm = params.incoterm || opportunity.custom_incoterm || 'CIF';
		const origin_scope = params.origin_scope || 'India';
		const exw_sub_type = incoterm === 'EXW' ? (params.exw_sub_type || 'Domestic') : '';

		return {
			opportunity: opportunity.name,
			inquiry: opportunity.name,
			opportunity_from: opportunity.opportunity_from,
			party_name: opportunity.party_name,
			customer_name: opportunity.customer_name,

			product: opportunity.custom_product_name,
			product_grade: opportunity.custom_product_grade,

			customer: opportunity.opportunity_from === 'Customer' ? opportunity.party_name : '',
			// supplier: opportunity.custom_preferred_supplier,
			customer_payment_term: opportunity.custom_customer_desired_payment_terms,

			country_of_destination: opportunity.custom_country_of__destination__ship_to_destination,
			port_of_discharge: opportunity.custom_port_of_destination,
			port_of_loading: opportunity.custom_port_of_loading,
			delivery_location: opportunity.custom_destination__place_of_delivery,
			shipping_line: opportunity.custom_preferred_shipping_line,

			incoterm,
			origin_scope,
			exw_sub_type,

			pincode: opportunity.custom_pincode || '',
			city: opportunity.custom_city_p || '',

			container_type: opportunity.custom_container_type,
			packing_type: opportunity.custom_packing_type || opportunity.custom_packing_type_with_unit_size_kg,
			std_packing: opportunity.custom_std_pakcing,
			packing_unit_size: opportunity.custom_unit_size_of_packing_kg,
			units_per_fcl: opportunity.custom_total_no_of_packing_units_in_a_container,
			total_fcl: opportunity.custom_total_no_of_ccontainers,

			lead: opportunity.opportunity_from === 'Lead' ? opportunity.party_name : '',
			prospect: (
				opportunity.opportunity_from === 'Prospect' ||
				opportunity.opportunity_from === 'Prospect (L3/Qualified)'
			) ? opportunity.party_name : ''
		};
	}

	set_source_context_from_data(data) {
		if (data && (data.inquiry || data.opportunity)) {
			this.source_context = {
				doctype: 'Opportunity',
				name: data.inquiry || data.opportunity
			};
			return;
		}

		this.source_context = null;
	}

	async get_route_source_data() {
		const params = this.get_route_params();
		if (!params.source_doctype || !params.source_name) return null;

		this.last_route_context_key = this.get_route_context_key();

		if (params.source_doctype === 'Opportunity') {
			const opportunity = await this.call_frappe('frappe.client.get', {
				doctype: 'Opportunity',
				name: params.source_name
			});
			const data = this.build_cost_sheet_data_from_opportunity(opportunity, params);
			this.set_source_context_from_data(data);
			return data;
		}

		if (params.source_doctype === 'Cost Sheet') {
			const doc = await this.fetch_cost_sheet_doc(params.source_name);
			this.set_source_context_from_data(doc);
			return doc;
		}

		return null;
	}

	set_save_primary_action() {
		this.page.set_primary_action('Save Cost Sheet', () => {
			this.save_cost_sheet();
		}, 'octicon octicon-check');
	}

	set_submit_primary_action() {
		this.page.set_primary_action(__('Submit'), () => {
			this.submit_current_cost_sheet();
		}, 'octicon octicon-check');
	}

	clear_page_actions() {
		this.page.clear_actions_menu();
		this.page.hide_actions_menu();
		this.page.clear_actions();
	}

	clear_workflow_actions() {
		this.render_actions();
	}

	clear_saved_doc_actions_while_loading() {
		this.render_actions({ loading: true });
	}

	update_status_indicator() {
		if (this.is_dirty && this.current_cost_sheet_doc) {
			this.page.set_indicator(__('Not Saved'), 'orange');
			return;
		}

		if (!this.current_cost_sheet_doc) {
			this.page.clear_indicator();
			return;
		}

		let indicator = null;
		try {
			indicator = frappe.get_indicator(this.current_cost_sheet_doc, 'Cost Sheet', true);
		} catch (e) {
			console.warn('Unable to resolve Cost Sheet indicator:', e);
		}

		let workflow_state_fieldname = null;
		try {
			workflow_state_fieldname = frappe.workflow?.get_state_fieldname?.('Cost Sheet');
		} catch (e) {
			workflow_state_fieldname = null;
		}

		const docstatus = Number(this.current_cost_sheet_doc.docstatus || 0);
		const workflow_status = (workflow_state_fieldname && this.current_cost_sheet_doc[workflow_state_fieldname])
			|| this.current_cost_sheet_doc.workflow_state;
		const field_status = this.current_cost_sheet_doc.status;
		let status = field_status || (indicator && indicator[0]);
		let color = (indicator && indicator[1]) || (docstatus === 2 ? 'red' : 'gray');

		if (docstatus === 2) {
			status = field_status || workflow_status || __('Cancelled');
			color = 'red';
		} else if (this.active_workflow && workflow_status) {
			status = workflow_status;
		}

		if (status) {
			this.page.set_indicator(__(status), color);
		} else {
			this.page.clear_indicator();
		}
	}

	set_iframe_doc_name(name, display_name) {
		const iframe = document.getElementById('cost-sheet-iframe');
		if (!iframe || !iframe.contentWindow) return;

		const doc = iframe.contentDocument || iframe.contentWindow.document;
		const nameInput = doc.getElementById('inp_doc_name');
		if (nameInput) {
			nameInput.value = name || '';
		}

		const idLabel = doc.getElementById('lbl-cost-sheet-id');
		if (idLabel) {
			idLabel.textContent = display_name || name || __('New Cost Sheet');
		}

		const numberLabel = doc.getElementById('lbl-cs-number');
		if (numberLabel) {
			numberLabel.textContent = name || __('Auto Generated');
			numberLabel.style.color = name ? '#1B82EE' : 'var(--color-text-muted)';
		}
	}

	is_current_doc_readonly() {
		return Boolean(
			this.current_cost_sheet_doc &&
			Number(this.current_cost_sheet_doc.docstatus || 0) !== 0
		);
	}

	sync_iframe_readonly_state() {
		const iframe = document.getElementById('cost-sheet-iframe');
		if (!iframe || !iframe.contentWindow) return;

		const doc = iframe.contentDocument || iframe.contentWindow.document;
		if (!doc || !doc.body) return;

		const readonly = this.is_current_doc_readonly();
		doc.body.classList.toggle('cost-sheet-readonly', readonly);

		doc.querySelectorAll('input, select, textarea, button').forEach((field) => {
			if (readonly) {
				if (field.dataset.costSheetReadonlyApplied !== '1') {
					field.dataset.costSheetOriginalDisabled = field.disabled ? '1' : '0';
					field.dataset.costSheetOriginalReadonly = field.readOnly ? '1' : '0';
					field.dataset.costSheetReadonlyApplied = '1';
				}
				field.disabled = true;
				if ('readOnly' in field) {
					field.readOnly = true;
				}
				return;
			}

			if (field.dataset.costSheetReadonlyApplied === '1') {
				field.disabled = field.dataset.costSheetOriginalDisabled === '1';
				if ('readOnly' in field) {
					field.readOnly = field.dataset.costSheetOriginalReadonly === '1';
				}
			}

			delete field.dataset.costSheetOriginalDisabled;
			delete field.dataset.costSheetOriginalReadonly;
			delete field.dataset.costSheetReadonlyApplied;
		});

		doc.querySelectorAll('[contenteditable]').forEach((field) => {
			if (readonly) {
				if (field.dataset.costSheetReadonlyApplied !== '1') {
					field.dataset.costSheetOriginalContenteditable = field.getAttribute('contenteditable') || '';
					field.dataset.costSheetReadonlyApplied = '1';
				}
				field.setAttribute('contenteditable', 'false');
				return;
			}

			if (field.dataset.costSheetReadonlyApplied === '1') {
				field.setAttribute('contenteditable', field.dataset.costSheetOriginalContenteditable || '');
			}
			delete field.dataset.costSheetOriginalContenteditable;
			delete field.dataset.costSheetReadonlyApplied;
		});
	}

	mark_cost_sheet_dirty() {
		if (this.suppress_dirty) return;

		if (this.is_current_doc_readonly()) {
			this.sync_iframe_readonly_state();
			return;
		}

		this.is_dirty = true;
		this.update_status_indicator();
		this.render_actions();
	}

	setup_iframe_dirty_tracking(iframe) {
		try {
			const doc = iframe.contentDocument || iframe.contentWindow.document;
			if (!doc || doc.__cost_sheet_dirty_tracking) return;

			doc.__cost_sheet_dirty_tracking = true;
			['input', 'change'].forEach((event_name) => {
				doc.addEventListener(event_name, () => {
					this.mark_cost_sheet_dirty();
				}, true);
			});
		} catch (e) {
			console.error('Unable to setup Cost Sheet dirty tracking:', e);
		}
	}

	get_packing_options_from_item(item) {
		const seen = new Set();
		const options = [];
		const add = (packing_type) => {
			if (!packing_type || seen.has(packing_type)) return;
			seen.add(packing_type);
			options.push({ packing_type });
		};

		(item.custom_packing_type || []).forEach(row => add(row.packing_type));
		(item.custom_standard_packing || item.custom_std_pakcing || []).forEach(row => add(row.packing_type));

		return options;
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
				this.suppress_dirty = true;

				this.setup_dynamic_link_fields(iframe);
				this.setup_dynamic_required_fields(iframe);
				this.setup_iframe_dirty_tracking(iframe);
				this.sync_iframe_readonly_state();

				// Poll until key dropdowns are populated, then load data from route params.
				// Max retries: 25 × 200ms = 5 seconds, then give up and show the form
				let _dropdownPollRetries = 0;
				const waitForDropdowns = () => {
					const doc = iframe.contentDocument || iframe.contentWindow.document;
					const productSel = doc.getElementById('inp_product');
					const customerSel = doc.getElementById('inp_customer');

					const productReady = productSel && productSel.options && productSel.options.length > 1;
					const customerReady = customerSel && customerSel.options && customerSel.options.length > 1;

					if (productReady && customerReady) {
						this.load_cost_sheet_data(iframe).finally(() => {
							setTimeout(() => this.hide_loading_overlay(), 500);
						});
					} else if (_dropdownPollRetries >= 25) {
						// Timed out after ~5 seconds — show the form anyway
						console.warn('Cost Sheet: dropdowns did not populate in time, showing form anyway.');
						this.load_cost_sheet_data(iframe).finally(() => {
							this.hide_loading_overlay();
						});
					} else {
						_dropdownPollRetries++;
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

			// Port of Loading fetch request from iframe, filtered by Country Origin
			if (event.data.type === 'fetch_pol_ports') {
				this.populate_pol_ports(event.data.country || '');
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
						const standardPackings = doc.custom_standard_packing || doc.custom_std_pakcing || [];
						const packings = this.get_packing_options_from_item(doc);
						const stdPackings = standardPackings;
						// ── ADD DBK AND RODTEP ──
						const dbk = doc.custom_duty_drawback_;
						const rodtep = doc.custom_rodtep_;

						const postProductResponse = (responseDoc = {}) => {
							const parentGrade = responseDoc.custom_item_grade || '';
							const pStandardPackings = responseDoc.custom_standard_packing || responseDoc.custom_std_pakcing || [];
							const pPackings = this.get_packing_options_from_item(responseDoc);
							const pStdPackings = pStandardPackings;
							const pDbk = responseDoc.custom_duty_drawback_;
							const pRodtep = responseDoc.custom_rodtep_;

							iframe.contentWindow.postMessage({
								type: 'product_grade_response',
								grade: grade || parentGrade,
								packings: packings.length ? packings : pPackings,
								stdPackings: stdPackings.length ? stdPackings : pStdPackings,
								custom_duty_drawback_: dbk !== undefined ? dbk : pDbk,
								custom_rodtep_: rodtep !== undefined ? rodtep : pRodtep
							}, '*');
						};

						if (parentItem && (!packings.length || !stdPackings.length || !grade)) {
							frappe.call({
								method: 'frappe.client.get',
								args: {
									doctype: 'Item',
									name: parentItem
								},
								callback: (rp) => {
									postProductResponse(rp.message || {});
								}
							});
						} else if (grade || packings.length || stdPackings.length || dbk !== undefined || rodtep !== undefined) {
							postProductResponse();
						} else {
							iframe.contentWindow.postMessage({ 
								type: 'product_grade_response', 
								grade: '', 
								packings: [], 
								stdPackings: [],
								custom_duty_drawback_: undefined,
								custom_rodtep_: undefined
							}, '*');
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
				console.log('dashboard: received fetch_customer_name request for:', event.data.customer);
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Customer',
						filters: { name: event.data.customer },
						fieldname: ['customer_name', 'custom_stuffing_address']
					},
					callback: (r) => {
						console.log('dashboard: frappe.client.get_value (name & stuffing) response:', r.message);
						const customer_name = (r.message || {}).customer_name || '';
						const stuffing_address = (r.message || {}).custom_stuffing_address || '';
						iframe.contentWindow.postMessage({
							type: 'customer_name_response',
							customer_name: customer_name,
							stuffing_address: stuffing_address
						}, '*');
					}
				});
			}

			// Customer stuffing address fetch request from iframe (domestic mode)
			if (event.data.type === 'fetch_customer_stuffing_address') {
				console.log('dashboard: received fetch_customer_stuffing_address request for:', event.data.customer);
				this.log_debug('received fetch_customer_stuffing_address request for ' + event.data.customer);
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Customer',
						filters: { name: event.data.customer },
						fieldname: 'custom_stuffing_address'
					},
					callback: (r) => {
						console.log('dashboard: frappe.client.get_value (stuffing only) response:', r.message);
						this.log_debug('frappe.client.get_value stuffing response: ' + JSON.stringify(r.message));
						const stuffing_address = (r.message || {}).custom_stuffing_address || '';
						iframe.contentWindow.postMessage({
							type: 'customer_stuffing_address_response',
							stuffing_address: stuffing_address
						}, '*');
					}
				});
			}

			// Lead name fetch request from iframe
			if (event.data.type === 'fetch_lead_name') {
				console.log('dashboard: received fetch_lead_name request for:', event.data.lead);
				const iframe = document.getElementById('cost-sheet-iframe');
				if (!iframe || !iframe.contentWindow) return;
				frappe.call({
					method: 'frappe.client.get_value',
					args: {
						doctype: 'Lead',
						filters: { name: event.data.lead },
						fieldname: 'lead_name'
					},
					callback: (r) => {
						console.log('dashboard: frappe.client.get_value (lead_name) response:', r.message);
						const lead_name = (r.message || {}).lead_name || '';
						iframe.contentWindow.postMessage({
							type: 'lead_name_response',
							lead_name: lead_name
						}, '*');
					}
				});
			}
		});
	}

	log_debug(msg) {
		console.log('DASHBOARD:', msg);
	}


	call_frappe(method, args = {}) {
		return new Promise((resolve, reject) => {
			frappe.call({
				method,
				args,
				callback: (r) => resolve(r.message),
				error: (r) => reject(r)
			});
		});
	}

	async refresh_workflow_metadata() {
		if (!frappe.workflow) {
			this.active_workflow = null;
			return null;
		}

		try {
			if (frappe.workflow.setup) {
				frappe.workflow.setup('Cost Sheet');
			}

			const state_fieldname = frappe.workflow.get_state_fieldname('Cost Sheet');
			if (!state_fieldname) {
				this.active_workflow = null;
				return null;
			}

			this.active_workflow = frappe.workflow.workflows['Cost Sheet'] || null;
			if (
				this.active_workflow &&
				Object.prototype.hasOwnProperty.call(this.active_workflow, 'is_active') &&
				!Number(this.active_workflow.is_active)
			) {
				this.active_workflow = null;
				return null;
			}
			return this.active_workflow;
		} catch (e) {
			this.active_workflow = null;
			console.warn('Unable to read local Cost Sheet workflow metadata:', e);
			return null;
		}
	}

	async fetch_cost_sheet_doc(name) {
		if (!name) return null;

		return await this.call_frappe('frappe.client.get', {
			doctype: 'Cost Sheet',
			name
		});
	}

	async set_current_cost_sheet_doc(doc, opts = {}) {
		if (!doc) return;

		this.current_cost_sheet_doc = doc;
		this.set_source_context_from_data(doc);
		this.set_iframe_doc_name(doc.name, doc.cost_sheet_name || doc.name);
		this.sync_iframe_readonly_state();

		if (opts.clean !== false) {
			this.is_dirty = false;
		}

		await this.refresh_workflow_actions();
		this.update_status_indicator();
	}

	async set_current_cost_sheet(name, opts = {}) {
		const doc = await this.fetch_cost_sheet_doc(name);
		await this.set_current_cost_sheet_doc(doc, opts);
	}

	is_transition_allowed_for_user(transition) {
		const user = frappe.session.user;
		const role_allowed = frappe.user_roles.includes(transition.allowed);
		const approval_allowed = (
			user === 'Administrator' ||
			transition.allow_self_approval ||
			user !== this.current_cost_sheet_doc.owner
		);

		return role_allowed && approval_allowed;
	}

	async get_workflow_transition_context() {
		if (!this.current_cost_sheet_doc || this.is_dirty) {
			return { has_workflow: false, transitions: [] };
		}

		try {
			const response = await this.call_frappe(
				'sukha.sukha.doctype.cost_sheet.cost_sheet.get_dashboard_workflow_transitions',
				{
					doc: {
						doctype: 'Cost Sheet',
						name: this.current_cost_sheet_doc.name
					}
				}
			);

			if (!response || !response.has_workflow) {
				this.active_workflow = null;
				return { has_workflow: false, transitions: [] };
			}

			this.active_workflow = response.workflow || null;
			return {
				has_workflow: true,
				transitions: (response.transitions || []).filter((transition) => this.is_transition_allowed_for_user(transition))
			};
		} catch (e) {
			this.active_workflow = null;
			return { has_workflow: false, transitions: [] };
		}
	}

	async get_current_doc_permissions() {
		if (!this.current_cost_sheet_doc) return {};

		try {
			const response = await this.call_frappe('frappe.client.get_doc_permissions', {
				doctype: 'Cost Sheet',
				docname: this.current_cost_sheet_doc.name
			});
			return (response && response.permissions) || {};
		} catch (e) {
			return {};
		}
	}

	async can_cancel_current_doc(has_workflow) {
		if (!this.current_cost_sheet_doc || Number(this.current_cost_sheet_doc.docstatus) !== 1) return false;

		const permissions = await this.get_current_doc_permissions();
		if (Object.keys(permissions).length && !permissions.cancel) return false;
		if (!Object.keys(permissions).length && !frappe.model.can_cancel('Cost Sheet')) return false;

		if (!has_workflow) return true;

		try {
			return await frappe.xcall(
				'frappe.model.workflow.can_cancel_document',
				{ doctype: 'Cost Sheet' },
				null,
				{ silent: true }
			);
		} catch (e) {
			return false;
		}
	}

	async can_submit_current_doc() {
		if (!this.current_cost_sheet_doc || Number(this.current_cost_sheet_doc.docstatus) !== 0 || this.is_dirty) return false;

		const permissions = await this.get_current_doc_permissions();
		if (Object.keys(permissions).length) return Boolean(permissions.submit);

		return Boolean(frappe.model.can_submit && frappe.model.can_submit('Cost Sheet'));
	}

	async render_actions(opts = {}) {
		const refresh_id = ++this.workflow_refresh_id;
		const loading = Boolean(opts.loading);

		this.workflow_actions_loading = loading;
		this.clear_page_actions();

		if (loading) return;

		if (!this.current_cost_sheet_doc || this.is_dirty) {
			this.set_save_primary_action();
			return;
		}

		const docstatus = Number(this.current_cost_sheet_doc.docstatus || 0);
		if (docstatus === 2) return;

		try {
			const { has_workflow, transitions } = await this.get_workflow_transition_context();
			if (refresh_id !== this.workflow_refresh_id) return;

			this.clear_page_actions();

			if (transitions.length) {
				transitions.forEach((transition) => {
					this.page.add_action_item(__(transition.action), () => {
						this.apply_workflow_action(transition);
					});
				});
				return;
			}

			if (docstatus === 0) {
				if (!has_workflow) {
					// No workflow: show Submit if permitted, otherwise Save
					if (await this.can_submit_current_doc()) {
						if (refresh_id !== this.workflow_refresh_id) return;
						this.set_submit_primary_action();
					} else {
						if (refresh_id !== this.workflow_refresh_id) return;
						this.set_save_primary_action();
					}
				} else {
					// Workflow exists but no transitions are available for this user/state.
					// Frappe core behaviour: the doc is still editable/saveable in this state.
					// Show Save so the user can update fields even while waiting for approval.
					if (refresh_id !== this.workflow_refresh_id) return;
					this.set_save_primary_action();
				}
				return;
			}

			if (docstatus === 1 && await this.can_cancel_current_doc(has_workflow)) {
				if (refresh_id !== this.workflow_refresh_id) return;
				this.page.set_secondary_action(__('Cancel'), () => {
					this.cancel_current_cost_sheet();
				});
			}
		} catch (e) {
			console.error('Unable to render Cost Sheet actions:', e);
			if (refresh_id !== this.workflow_refresh_id) return;
			this.clear_page_actions();
			if (!this.current_cost_sheet_doc || this.is_dirty) {
				this.set_save_primary_action();
			}
		}
	}

	async refresh_workflow_actions(opts = {}) {
		return this.render_actions(opts);
	}

	async submit_current_cost_sheet() {
		if (!this.current_cost_sheet_doc || Number(this.current_cost_sheet_doc.docstatus) !== 0 || this.is_dirty) return;

		frappe.confirm(
			__('Permanently Submit {0}?', [this.current_cost_sheet_doc.name]),
			() => {
				frappe.call({
					method: 'frappe.desk.form.save.savedocs',
					args: {
						doc: this.current_cost_sheet_doc,
						action: 'Submit'
					},
					freeze: true,
					freeze_message: __('Submitting'),
					callback: () => {
						this.set_current_cost_sheet(this.current_cost_sheet_doc.name).catch((e) => {
							console.error('Unable to refresh Cost Sheet after submit:', e);
							this.render_actions();
						});
					}
				});
			}
		);
	}

	async cancel_current_cost_sheet() {
		if (!this.current_cost_sheet_doc || Number(this.current_cost_sheet_doc.docstatus) !== 1) return;

		frappe.confirm(
			__('Permanently Cancel {0}?', [this.current_cost_sheet_doc.name]),
			() => {
				const args = {
					doctype: 'Cost Sheet',
					name: this.current_cost_sheet_doc.name
				};
				let workflow_state_fieldname = null;
				try {
					workflow_state_fieldname = frappe.workflow?.get_state_fieldname?.('Cost Sheet');
				} catch (e) {
					workflow_state_fieldname = null;
				}
				if (workflow_state_fieldname && this.current_cost_sheet_doc[workflow_state_fieldname]) {
					args.workflow_state_fieldname = workflow_state_fieldname;
					args.workflow_state = this.current_cost_sheet_doc[workflow_state_fieldname];
				}

				frappe.call({
					method: 'frappe.desk.form.save.cancel',
					args,
					freeze: true,
					callback: () => {
						this.set_current_cost_sheet(args.name).catch((e) => {
							console.error('Unable to refresh Cost Sheet after cancel:', e);
							this.render_actions();
						});
					}
				});
			}
		);
	}

	async prompt_rejection_remarks() {
		return new Promise((resolve, reject) => {
			const dialog = new frappe.ui.Dialog({
				title: __('Rejection Remarks'),
				fields: [
					{
						fieldname: 'remarks',
						label: __('Remarks'),
						fieldtype: 'Small Text',
						reqd: 1
					}
				],
				primary_action_label: __('Reject'),
				primary_action: (values) => {
					const remarks = (values.remarks || '').trim();
					if (!remarks) {
						frappe.msgprint({
							title: __('Validation'),
							message: __('Please enter rejection remarks.'),
							indicator: 'red'
						});
						return;
					}

					dialog.hide();
					resolve(remarks);
				},
				secondary_action_label: __('Cancel'),
				secondary_action: () => {
					dialog.hide();
					reject();
				}
			});

			dialog.show();
		});
	}

	async apply_workflow_action(transition) {
		if (!this.current_cost_sheet_doc || this.is_dirty) {
			this.clear_workflow_actions();
			frappe.msgprint(__('Please save the Cost Sheet before applying a workflow action.'));
			return;
		}

		try {
			if (this.active_workflow && this.active_workflow.enable_action_confirmation) {
				const confirmed = await new Promise((resolve) => {
					frappe.confirm(
						__('Are you sure you want to {0}?', [transition.action]),
						() => resolve(true),
						() => resolve(false)
					);
				});
				if (!confirmed) return;
			}

			frappe.dom.freeze(__('Applying workflow action...'));

			if (/reject/i.test(transition.action)) {
				frappe.dom.unfreeze();
				const remarks = await this.prompt_rejection_remarks();
				frappe.dom.freeze(__('Applying workflow action...'));

				await frappe.db.set_value('Cost Sheet', this.current_cost_sheet_doc.name, 'remarks', remarks);
				this.current_cost_sheet_doc = await this.fetch_cost_sheet_doc(this.current_cost_sheet_doc.name);
			}

			const updated_doc = await frappe.xcall('frappe.model.workflow.apply_workflow', {
				doc: this.current_cost_sheet_doc,
				action: transition.action
			});

			this.current_cost_sheet_doc = updated_doc;
			this.is_dirty = false;
			this.set_iframe_doc_name(updated_doc.name, updated_doc.cost_sheet_name || updated_doc.name);
			this.sync_iframe_readonly_state();
			await this.refresh_workflow_actions();
			this.update_status_indicator();

			frappe.show_alert({
				message: __('Workflow action applied.'),
				indicator: 'green'
			}, 3);
		} catch (e) {
			if (e) {
				console.error('Workflow action failed:', e);
			}
		} finally {
			frappe.dom.unfreeze();
		}
	}

	prepare_cost_sheet_data_for_save(data) {
		const payload = Object.assign({}, data || {});
		const inquiry = (this.source_context && this.source_context.doctype === 'Opportunity' && this.source_context.name)
			|| payload.inquiry
			|| payload.opportunity
			|| (this.current_cost_sheet_doc && this.current_cost_sheet_doc.inquiry);

		if (inquiry) {
			payload.inquiry = inquiry;
		}
		delete payload.opportunity;

		if (!payload.name && this.current_cost_sheet_doc && this.current_cost_sheet_doc.name) {
			payload.name = this.current_cost_sheet_doc.name;
		}

		if (payload.name) {
			delete payload.naming_series;
		}

		return payload;
	}

	finish_cost_sheet_load(data) {
		this.suppress_dirty = false;

		if (data && data.name) {
			this.set_current_cost_sheet(data.name).catch((e) => {
				console.error('Unable to load workflow actions for Cost Sheet:', e);
				this.render_actions();
			});
		} else {
			this.current_cost_sheet_doc = null;
			this.sync_iframe_readonly_state();
			this.is_dirty = true;
			this.update_status_indicator();
			this.render_actions();
		}
	}

	save_cost_sheet_from_iframe(data) {
		const payload = this.prepare_cost_sheet_data_for_save(data);

		frappe.call({
			method: 'sukha.sukha.doctype.cost_sheet.cost_sheet.create_from_dashboard',
			args: { data: payload },
			callback: (r) => {
				if (r.message) {
					const costSheetName = r.message.cost_sheet;
					// const quotationName = r.message.quotation;

					this.suppress_dirty = false;
					this.set_iframe_doc_name(costSheetName, costSheetName);
					this.replace_dashboard_route({
						source_doctype: 'Cost Sheet',
						source_name: costSheetName
					});
					this.set_current_cost_sheet(costSheetName).catch((e) => {
						console.error('Unable to refresh workflow after Cost Sheet save:', e);
						this.render_actions();
					});
					// Build link buttons for the dialog
					let linksHtml = `
						<div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
							<a href="/app/cost-sheet/${costSheetName}" target="_blank"
								style="
									display:inline-flex; align-items:center; gap:6px;
									padding:8px 18px; border-radius:6px; font-size:13px; font-weight:600;
									background:var(--primary); color:var(--white);
									text-decoration:none;
								">
								<i class="octicon octicon-file-text"></i>
								${__('Open Cost Sheet')} — ${costSheetName}
							</a>
					`;

					// if (quotationName) {
					// 	linksHtml += `
					// 		<a href="/app/quotation/${quotationName}" target="_blank"
					// 			style="
					// 				display:inline-flex; align-items:center; gap:6px;
					// 				padding:8px 18px; border-radius:6px; font-size:13px; font-weight:600;
					// 				background:var(--success); color:var(--white);
					// 				text-decoration:none;
					// 			">
					// 			<i class="octicon octicon-checklist"></i>
					// 			${__('Open Quotation')} — ${quotationName}
					// 		</a>
					// 	`;
					// }

					linksHtml += `</div>`;

					const msg = __('Cost Sheet created successfully.')
						

					frappe.msgprint({
						title: __('Saved Successfully'),
						message: msg + linksHtml,
						indicator: 'green'
					});
				}
			},
			error: (r) => {
				this.suppress_dirty = false;
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
		this.current_cost_sheet_doc = null;
		this.sync_iframe_readonly_state();
		this.source_context = null;
		this.pending_load_data = null;
		this.last_route_context_key = null;
		this.is_dirty = false;
		this.suppress_dirty = false;
		this.replace_dashboard_route();
		this.update_status_indicator();
		this.set_iframe_doc_name(null);
		this.render_actions();

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
								me.set_current_cost_sheet_doc(r.message).catch((e) => {
									console.error('Unable to refresh workflow after loading Cost Sheet:', e);
									me.render_actions();
								});
								me.pending_load_data = r.message;
								me.replace_dashboard_route({
									source_doctype: 'Cost Sheet',
									source_name: r.message.name
								});
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

	async load_cost_sheet_data(iframe) {
		try {
			let data = this.pending_load_data;
			this.pending_load_data = null;

			if (!data) {
				data = await this.get_route_source_data();
			}

			if (!data) {
				this.suppress_dirty = false;
				this.render_actions();
				return;
			}

			this.set_source_context_from_data(data);
			this.suppress_dirty = true;
			if (data.name) {
				this.clear_saved_doc_actions_while_loading();
				this.set_current_cost_sheet(data.name).catch((e) => {
					console.error('Unable to refresh workflow while loading Cost Sheet:', e);
					this.render_actions();
				});
			}
			const doc = iframe.contentDocument || iframe.contentWindow.document;

			const setInput = (id, val) => {
				const el = doc.getElementById(id);
				if (el && val !== undefined && val !== null) {
					el.value = val;
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				}
			};
			console.log('Loading Cost Sheet data:', data);

			// Handle Lead/Prospect/Customer conditional display
			const oppFrom = data.opportunity_from;
			const partyName = data.party_name;

			// Get the wrapper elements
			const customerWrapper = doc.getElementById('wrapper-customer');
			const leadWrapper = doc.getElementById('wrapper-lead');
			const leadNameWrapper = doc.getElementById('wrapper-lead-name');
			const prospectWrapper = doc.getElementById('wrapper-prospect');
			const leadInput = doc.getElementById('inp_lead');
			const prospectInput = doc.getElementById('inp_prospect');

			// Hide all by default
			if (customerWrapper) customerWrapper.style.display = 'none';
			if (leadWrapper) leadWrapper.style.display = 'none';
			if (leadNameWrapper) leadNameWrapper.style.display = 'none';
			if (prospectWrapper) prospectWrapper.style.display = 'none';
			if (data.name) {
				setInput('inp_doc_name', data.name);
				this.set_iframe_doc_name(data.name, data.cost_sheet_name || data.name);
			}
			// Show the appropriate one based on opportunity_from or direct cost sheet data
			if ((oppFrom === 'Lead' && partyName) || data.lead) {
				const val = (oppFrom === 'Lead' ? partyName : data.lead);
				console.log('Showing Lead field with:', val);
				if (leadWrapper) leadWrapper.style.display = 'block';
				if (leadNameWrapper) leadNameWrapper.style.display = 'block';
				if (leadInput) {
					leadInput.value = val;
					leadInput.readOnly = true;
					leadInput.dispatchEvent(new Event('input', { bubbles: true }));
					leadInput.dispatchEvent(new Event('change', { bubbles: true }));
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
					prospectInput.dispatchEvent(new Event('input', { bubbles: true }));
					prospectInput.dispatchEvent(new Event('change', { bubbles: true }));
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
				'pincode': 'inp_pincode',
				'city': 'inp_city',
				'port_of_discharge': 'inp_pod',
				'port_of_loading': 'inp_pol',
				'loading_location': 'inp_loading_location',
				'delivery_location': 'inp_destination',
				'stuffing_at': 'inp_stuffing_at',
				'stuffing_location': 'inp_stuffing_loc',
				'stuffing_warehouse': 'inp_stuffing_loc',

				// Container & Packing
				'container_type': 'inp_container',
				'packing_type': 'inp_packing_type',
				'custom_packing_type': 'inp_packing_type',
				'custom_packing_type_with_unit_size_kg': 'inp_packing_type',
				'packing_unit_size': 'inp_unit_size',
				'std_packing': 'inp_std_packing',
				'custom_std_pakcing': 'inp_std_packing',
				'units_per_fcl': 'inp_units_per_fcl',
				'total_fcl': 'inp_total_fcl',

				// Currency & Exchange
				'currency': 'inp_cs_currency',
				'exchange_premium': 'inp_premium',
				'shipping_premium': 'inp_ship_premium',
				'exchange_rate': 'inp_base_rate',

				// Cost Sheet Type & Incoterm
				'cost_sheet_type': 'inp_master_cs_type',
				'incoterm': 'inp_user_incoterm',
				'origin_scope': 'inp_user_origin',
				'type_of_sale': 'inp_type_of_sale',
				'exw_sub_type': 'inp_exw_subtype',
				'status': 'inp_status',

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
			const deferredFields = ['packing_type', 'custom_packing_type', 'custom_packing_type_with_unit_size_kg', 'std_packing', "custom_std_pakcing"];
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

			// const setInput = (id, val) => {
			// 	const el = doc.getElementById(id);
			// 	if (el && val !== undefined && val !== null) {
			// 		el.value = val;
			// 		el.dispatchEvent(new Event('input', { bubbles: true }));
			// 		el.dispatchEvent(new Event('change', { bubbles: true }));
			// 	}
			// };

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
				this.set_iframe_doc_name(data.name, data.cost_sheet_name || data.name);
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
				setInput('cell_comm_val', margin.commission_value);
				setInput('cell_comm_val_exw', margin.commission_value);
				setInput('cell_dbk_pct', margin.duty_drawback_percentage);
				setInput('cell_rodtep_pct', margin.rodtep_percentage);
			}

			if (data.exchange_premium !== undefined) {
				setInput('inp_exchange_premium', data.exchange_premium);
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

				// Apply deferred fields after product-driven dropdowns settle.
				const PACKING_TYPE_KEYS = ['packing_type', 'custom_packing_type', 'custom_packing_type_with_unit_size_kg'];
				const STD_PACKING_KEYS = ['std_packing', 'custom_std_pakcing'];
				const packingTypeDocField = PACKING_TYPE_KEYS.find(k => deferredValues[k] !== undefined);
				const stdPackingDocField = STD_PACKING_KEYS.find(k => deferredValues[k] !== undefined);

				const applyDeferredField = (docField, opts = {}) => {
					const inputId = fieldMapping[docField];
					const element = doc.getElementById(inputId);
					if (!element || deferredValues[docField] === undefined || deferredValues[docField] === null) return true;

					let valueToSet = deferredValues[docField];
					if (valueToSet === '') return true;

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
					if (opts.triggerOnchange && element.onchange) {
						element.onchange();
					}

					console.log(`Applied deferred ${docField}: ${valueToSet} into ${inputId}, value now: ${element.value}`);
					return element.tagName !== 'SELECT' || element.value === valueToSet;
				};

				const retryDeferredField = (docField, opts, done, attempt = 0) => {
					if (!docField) {
						done();
						return;
					}

					const applied = applyDeferredField(docField, opts);
					if (applied || attempt >= 15) {
						done();
						return;
					}

					setTimeout(() => retryDeferredField(docField, opts, done, attempt + 1), 200);
				};

				const calculateAndFinishLoad = () => {
					if (iframe.contentWindow && typeof iframe.contentWindow.calculateEngine === 'function') {
						console.log('Triggering calculateEngine after data load');
						iframe.contentWindow.calculateEngine();
					}

					this.finish_cost_sheet_load(data);
				};

				retryDeferredField(packingTypeDocField, {}, () => {
					retryDeferredField(
						stdPackingDocField,
						{ triggerOnchange: true },
						calculateAndFinishLoad
					);
				});
			}, 1500);

			frappe.show_alert({
				message: __('Cost Sheet data loaded successfully'),
				indicator: 'green'
			}, 5);

		} catch (e) {
			this.suppress_dirty = false;
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
				'Port Details'
			);

			// Country Origin — the iframe has no Frappe desk JS, so it cannot fill this itself
			this.populate_select(doc, ['#inp_country'], 'Country');

			// Port of Loading is NOT populated here. There are ~87k Port Details rows, so it is
			// only ever loaded filtered by Country Origin. The iframe asks for it via the
			// 'fetch_pol_ports' message whenever the origin or country changes.

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

			// Std. Packing is populated dynamically by the iframe from the selected Item's
			// custom_standard_packing rows, filtered by the chosen Packing Type. We do NOT
			// populate it here to avoid overwriting the filtered options.



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
	// PORT OF LOADING — FILTERED BY COUNTRY ORIGIN
	// ─────────────────────────────────────────────────────────────

	send_pol_ports(country, ports) {
		const iframe = document.getElementById('cost-sheet-iframe');
		if (!iframe || !iframe.contentWindow) return;
		iframe.contentWindow.postMessage({
			type: 'pol_ports_response',
			country: country,
			ports: ports
		}, '*');
	}

	populate_pol_ports(country) {
		// Port Details has ~87k rows. Never load it unfiltered — with no country
		// selected the user gets an empty list rather than a truncated one.
		if (!country) {
			this.send_pol_ports('', []);
			return Promise.resolve();
		}

		return frappe.db.get_list('Port Details', {
			filters: { country: country },
			fields: ['name'],
			limit: 5000,
			order_by: 'name asc'
		}).then(records => {
			this.send_pol_ports(country, (records || []).map(r => r.name));
		});
	}

	// ─────────────────────────────────────────────────────────────
	// FETCH PRODUCT GRADE FROM ITEM
	// ─────────────────────────────────────────────────────────────

	fetch_product_grade(doc, item_name) {
		if (!item_name) {
			// Clear dependent fields if no product selected
			const $grade = this.get_iframe_select(doc, ['#inp_grade', 'input[id*="grade"]']);
			$grade.val('');
			const packingTypeEl = doc.getElementById('inp_packing_type');
			if (packingTypeEl) {
				packingTypeEl.innerHTML = '<option value="">Select...</option>';
			}
			return;
		}

		// Fetch full Item so packing child-table options are available too.
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Item',
				name: item_name
			},
			callback: (r) => {
				if (!r.message) return;
				const itemDoc = r.message || {};
				const grade = itemDoc.custom_item_grade || '';
				const parentItem = itemDoc.variant_of || '';
				const dbk = itemDoc.custom_duty_drawback_;
				const rodtep = itemDoc.custom_rodtep_;

				const setGrade = (val) => {
					const $grade = this.get_iframe_select(doc, ['#inp_grade', 'input[id*="grade"]']);
					if ($grade.length) {
						$grade.val(val);
						$grade.trigger('change');
					}
				};

				const setPackingOptions = (item) => {
					const packingTypeEl = doc.getElementById('inp_packing_type');
					if (!packingTypeEl) return;

					const currentVal = packingTypeEl.value;
					packingTypeEl.innerHTML = '<option value="">Select...</option>';
					this.get_packing_options_from_item(item).forEach((row) => {
						const opt = doc.createElement('option');
						opt.value = row.packing_type;
						opt.textContent = row.packing_type;
						packingTypeEl.appendChild(opt);
					});

					if (currentVal) {
						let optionExists = Array.from(packingTypeEl.options).some(opt => opt.value === currentVal);
						if (!optionExists) {
							const opt = doc.createElement('option');
							opt.value = currentVal;
							opt.textContent = currentVal;
							packingTypeEl.appendChild(opt);
						}
						packingTypeEl.value = currentVal;
					}
				};

				// Set DBK and RoDTEP directly in iframe
				const setDbkRodtep = (dbkVal, rodtepVal) => {
					const dbkEl = doc.getElementById('cell_dbk_pct');
					const rodtepEl = doc.getElementById('cell_rodtep_pct');
					let hasValues = false;
					if (dbkEl && dbkVal !== undefined && dbkVal !== null && dbkVal !== '') {
						const dbkNum = parseFloat(dbkVal);
						if (!isNaN(dbkNum) && dbkNum > 0) {
							dbkEl.value = dbkNum.toFixed(1);
							dbkEl.dispatchEvent(new Event('input', { bubbles: true }));
							hasValues = true;
						}
					}
					if (rodtepEl && rodtepVal !== undefined && rodtepVal !== null && rodtepVal !== '') {
						const rodtepNum = parseFloat(rodtepVal);
						if (!isNaN(rodtepNum) && rodtepNum > 0) {
							rodtepEl.value = rodtepNum.toFixed(1);
							rodtepEl.dispatchEvent(new Event('input', { bubbles: true }));
							hasValues = true;
						}
					}
					if (hasValues) {
						const rodtepChk = doc.getElementById('chk_scheme_rodtep');
						if (rodtepChk) {
							rodtepChk.checked = true;
							rodtepChk.dispatchEvent(new Event('change', { bubbles: true }));
						}
					}
				};

				const hasItemPackings = this.get_packing_options_from_item(itemDoc).length > 0;
				setPackingOptions(itemDoc);

				const applyItemValues = () => {
					if (grade) {
						setGrade(grade);
						setDbkRodtep(dbk, rodtep);
					} else {
						setDbkRodtep(dbk, rodtep);
					}
				};

				if (parentItem && (!grade || !hasItemPackings)) {
					// Variant item — packing options often live on the parent/template item.
					frappe.call({
						method: 'frappe.client.get',
						args: {
							doctype: 'Item',
							name: parentItem
						},
						callback: (rp) => {
							const pDoc = rp.message || {};
							if (!hasItemPackings) {
								setPackingOptions(pDoc);
							}
							if (!grade) {
								setGrade(pDoc.custom_item_grade || '');
								setDbkRodtep(pDoc.custom_duty_drawback_, pDoc.custom_rodtep_);
							} else {
								applyItemValues();
							}
						}
					});
				} else {
					applyItemValues();
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

			const existingMarker = label
				? label.querySelector(".req, .req-marker, .required-star")
				: null;
			const dynamicMarker = label
				? label.querySelector(".req-marker")
				: null;

			if (!value) {
				field.classList.add("required-empty");

				if (label && !existingMarker) {
					const marker = doc.createElement("span");
					marker.className = "req-marker";
					marker.innerHTML = "*";
					label.appendChild(marker);
				}
			} else {
				field.classList.remove("required-empty");
				field.style.border = "";
				field.style.boxShadow = "";

				if (dynamicMarker) {
					dynamicMarker.remove();
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
			if ($label.length && !$label.find(".req, .req-marker, .required-star").length) {
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