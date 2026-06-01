/**
 * Cost Sheet Engine - Main JavaScript Controller
 * Handles all calculations, UI updates, and ERPNext integration
 */

"use strict";

// Utility functions
const $ = id => document.getElementById(id);
const v = id => parseFloat($(id)?.value) || 0;

const fmt = (num, decimals = 0) => {
	if (isNaN(num) || !isFinite(num)) return '—';
	return num.toLocaleString('en-IN', { 
		minimumFractionDigits: decimals, 
		maximumFractionDigits: decimals 
	});
};

const setTxt = (id, val, decimals = 0) => {
	const el = $(id);
	if (el) el.textContent = (isNaN(val) || !isFinite(val)) ? '—' : fmt(val, decimals);
};

const setVal = (id, val) => {
	const el = $(id);
	if (el) el.value = val;
};

// Workbook defaults for different cost sheet variants
const WORKBOOK_DEFAULTS = {
	"India-CIF": { 
		offered: 147, comm: 10, doc: 320, intPct: 2, rm: -1500, 
		pmUnit: 7500, pmUnits: 20, repack: 500, labels: 50, 
		sfFcl: 650, vanUsd: 150 
	},
	"India-FOB": { 
		offered: 155, comm: 10, doc: 250, intPct: 2, rm: 1300, 
		pmUnit: 7500, pmUnits: 20, repack: 500, labels: 50 
	},
	"India-Domestic-EXW": { 
		offered: 8500, comm: 500, doc: 0, intPct: 1.5, creditPct: 1, 
		basic: -2000, freightInward: 12000, pmUnit: 8200, pmUnits: 20, 
		plyPrice: 350, plyUnits: 5, repack: 500, vanning: 7000, 
		freightDest: 15000, handling: 3000, warehouse: 250, labels: 50, 
		labelsFcl: 2000 
	},
	"India-Merchant-EXW": { 
		offered: 8000, comm: 500, doc: 320, intPct: 1.5, creditPct: 1, 
		rm: -1500, pmUnit: 8200, pmUnits: 20, plyPrice: 350, plyUnits: 5, 
		repack: 500, vanning: 7000, labels: 50 
	},
	"India-Repacking Service-EXW": { 
		offered: 2000, comm: 100, doc: 0, intPct: 0.5, creditPct: 1, 
		basic: 0, freightInward: 0, pmUnit: 0, pmUnits: 20, 
		plyPrice: 350, plyUnits: 5, repack: 7500, vanning: 800, 
		freightDest: 0, handling: 2500, warehouse: 2000, 
		labelsFcl: 1000, qc: 2000, stickersFcl: 1000 
	},
	"TC-FOB": { 
		offered: 255, comm: 10, doc: 250, intPct: 2, tcBuy: 185, 
		sfFcl: 650, vanUsd: 150 
	},
	"TC-CIF": { 
		offered: 230, comm: 5, doc: 500, intPct: 2, tcBuy: 185 
	}
};

// Helper functions
function isIndiaExportVariant(variant) {
	return variant === 'India-FOB' || variant === 'India-CIF';
}

function isExwVariant(variant) {
	return variant === 'India-Domestic-EXW' || 
	       variant === 'India-Merchant-EXW' || 
	       variant === 'India-Repacking Service-EXW';
}

function isAdvanceLicenseActive() {
	return $('chk_scheme_advance')?.checked || false;
}

function getMappedSheetName() {
	const variant = $('inp_master_cs_type')?.value || 'India-CIF';
	const incoterm = $('inp_incoterm')?.value || 'CIF';
	
	if (isIndiaExportVariant(variant) && isAdvanceLicenseActive() && 
	    (incoterm === 'FOB' || incoterm === 'CIF')) {
		return `${variant}-AA-DFIA`;
	}
	return variant;
}

// Apply variant defaults
function applyVariantDefaults(variant) {
	const d = WORKBOOK_DEFAULTS[variant] || WORKBOOK_DEFAULTS["India-CIF"];
	
	setVal('inp_offered_price', d.offered);
	setVal('inp_offered_price_exw', d.offered);
	setVal('cell_comm_val', d.comm);
	setVal('cell_comm_val_exw', d.comm);
	setVal('inp_doc_usd_tot', d.doc);
	setVal('inp_mer_doc_usd_tot', d.doc);
	setVal('inp_int_cost_pct', d.intPct);
	
	if (d.creditPct !== undefined) setVal('inp_dom_credit_pct', d.creditPct);
	if (d.basic !== undefined) setVal('inp_dom_basic_rs_mt', d.basic);
	if (d.freightInward !== undefined) setVal('inp_dom_freight_inward', d.freightInward);
	if (d.rm !== undefined) setVal('inp_rm_rs_mt', d.rm);
	if (d.pmUnit !== undefined) setVal('inp_pm_unit_cost', d.pmUnit);
	if (d.pmUnits !== undefined) setVal('inp_pm_units_fcl', d.pmUnits);
	if (d.plyPrice !== undefined) setVal('inp_dom_ply_price', d.plyPrice);
	if (d.plyUnits !== undefined) setVal('inp_dom_ply_units', d.plyUnits);
	if (d.repack !== undefined) setVal('inp_repack_rs_mt', d.repack);
	if (d.vanning !== undefined) setVal('inp_vanning_rs_fcl', d.vanning);
	if (d.freightDest !== undefined) setVal('inp_dom_freight_dest', d.freightDest);
	if (d.handling !== undefined) setVal('inp_dom_handling_cost', d.handling);
	if (d.warehouse !== undefined) setVal('inp_dom_warehouse_rs_mt', d.warehouse);
	if (d.labels !== undefined) setVal('inp_labels_rs_mt', d.labels);
	if (d.labelsFcl !== undefined) setVal('inp_dom_labels_fcl', d.labelsFcl);
	if (d.tcBuy !== undefined) setVal('inp_tc_usd_mt', d.tcBuy);
	if (d.sfFcl !== undefined) setVal('inp_tc_sf_fcl', d.sfFcl);
	if (d.vanUsd !== undefined) setVal('inp_tc_van_usd', d.vanUsd);
	
	if ($('cell_dbk_pct')) $('cell_dbk_pct').value = isAdvanceLicenseActive() ? 0 : 1.1;
	if ($('cell_rodtep_pct')) $('cell_rodtep_pct').value = isAdvanceLicenseActive() ? 0 : 0.7;
}

// Toggle section collapse
function toggleSection(header) { 
	header.parentElement.classList.toggle('collapsed'); 
}

// Update stuffing location based on selection
function updateStuffingLoc() {
	const stuffingAt = $('inp_stuffing_at')?.value || "";
	const locField = $('inp_stuffing_loc');
	if (!locField) return;
	
	if (stuffingAt.includes('Panoli')) locField.value = 'Panoli';
	else if (stuffingAt.includes('Mundra')) locField.value = 'Mundra';
	else locField.value = 'Factory Premises';
}

// Update container defaults
function updateContainerDefaults() {
	const cType = $('inp_container')?.value || "";
	
	if (cType === '40 FCL') {
		if ($('inp_units_per_fcl')) $('inp_units_per_fcl').value = 40;
	} else if (cType === 'ISO Tank Container') {
		if ($('inp_units_per_fcl')) $('inp_units_per_fcl').value = 1;
		if ($('inp_unit_size')) $('inp_unit_size').value = 24000;
	} else {
		if ($('inp_units_per_fcl')) $('inp_units_per_fcl').value = 20;
		if ($('inp_unit_size')) $('inp_unit_size').value = 1135;
	}
	calculateEngine();
}

// Derive master variant from user inputs
function deriveMasterVariantFromFields() {
	const inc = $('inp_user_incoterm')?.value || 'CIF';
	const originEl = $('inp_user_origin');
	const originWrapper = $('wrapper-origin-scope');
	const tcOption = originEl?.querySelector('option[value="TC"]');
	
	if (tcOption) tcOption.disabled = inc === 'EXW';
	if (inc === 'EXW' && originEl?.value === 'TC') originEl.value = 'India';
	if (originWrapper) originWrapper.style.display = inc === 'EXW' ? 'none' : 'block';
	
	const orig = originEl?.value || 'India';
	const exwWrapper = $('wrapper-exw-subscope');
	if (exwWrapper) {
		exwWrapper.style.display = inc === 'EXW' ? 'block' : 'none';
	}
	
	let masterVal = 'India-CIF';
	let saleType = 'Direct Export';
	
	if (orig === 'TC') {
		masterVal = inc === 'CIF' ? 'TC-CIF' : 'TC-FOB';
		saleType = 'TC';
	} else {
		if (inc === 'CIF') { 
			masterVal = 'India-CIF'; 
			saleType = 'Direct Export'; 
		} else if (inc === 'FOB') { 
			masterVal = 'India-FOB'; 
			saleType = 'Direct Export'; 
		} else if (inc === 'EXW') {
			const sub = $('inp_exw_subtype')?.value || 'Domestic';
			if (sub === 'Merchant') masterVal = 'India-Merchant-EXW';
			else if (sub === 'Repacking Service') masterVal = 'India-Repacking Service-EXW';
			else masterVal = 'India-Domestic-EXW';
			saleType = sub;
		}
	}
	
	if ($('inp_master_cs_type')) $('inp_master_cs_type').value = masterVal;
	if ($('inp_incoterm')) $('inp_incoterm').value = inc;
	if ($('inp_type_of_sale')) $('inp_type_of_sale').value = saleType;
	
	onMasterVariantChange();
}

// Handle scheme checkbox toggle
function onSchemeCheckboxToggle(type) {
	const chkRodtep = $('chk_scheme_rodtep');
	const chkAdvance = $('chk_scheme_advance');
	
	if (type === 'rodtep' && chkRodtep?.checked) {
		if (chkAdvance) chkAdvance.checked = false;
	} else if (type === 'advance' && chkAdvance?.checked) {
		if (chkRodtep) chkRodtep.checked = false;
	}
	
	applyScopeLogic();
}

// Handle master variant change
function onMasterVariantChange() {
	const variant = $('inp_master_cs_type').value;
	applyVariantDefaults(variant);
	applyScopeLogic();
}

// Apply scope logic based on variant
function applyScopeLogic() {
	const variant = $('inp_master_cs_type').value;
	const incoterm = $('inp_incoterm').value;
	const saleType = $('inp_type_of_sale').value;
	
	const isTC = variant.startsWith('TC-');
	const isTCFob = variant === 'TC-FOB';
	const isDom = variant === 'India-Domestic-EXW';
	const isMer = variant === 'India-Merchant-EXW';
	const isRepack = variant === 'India-Repacking Service-EXW';
	const isExw = isDom || isMer || isRepack;
	const isExport = isIndiaExportVariant(variant);
	const isAdvLicense = $('chk_scheme_advance')?.checked || false;
	const isRodtepActive = $('chk_scheme_rodtep')?.checked || false;
	
	// Update UI labels
	$('lbl-rp-badge').textContent = incoterm;
	$('lbl-rp-scope').textContent = variant;
	
	const mappedSheet = getMappedSheetName();
	$('lbl-mapped-sheet').textContent = mappedSheet;
	
	// Show/hide sections based on variant
	const rowSchemesEl = $('row-schemes');
	if (rowSchemesEl) {
		rowSchemesEl.classList.toggle('d-none', isTC || isDom || isMer);
	}
	
	// Toggle visibility classes
	document.querySelectorAll('.domestic-only').forEach(el => 
		el.classList.toggle('d-none', !isDom && !isRepack));
	document.querySelectorAll('.domestic-hide').forEach(el => 
		el.classList.toggle('d-none', isDom || isRepack));
	document.querySelectorAll('.merchant-only').forEach(el => 
		el.classList.toggle('d-none', !isMer));
	document.querySelectorAll('.merchant-hide').forEach(el => 
		el.classList.toggle('d-none', isMer));
	document.querySelectorAll('.repack-only').forEach(el => 
		el.classList.toggle('d-none', !isRepack));
	document.querySelectorAll('.repack-hide').forEach(el => 
		el.classList.toggle('d-none', isRepack));
	document.querySelectorAll('.exw-only').forEach(el => 
		el.classList.toggle('d-none', !isExw));
	document.querySelectorAll('.exw-hide').forEach(el => 
		el.classList.toggle('d-none', isExw));
	document.querySelectorAll('.non-exw-only').forEach(el => 
		el.classList.toggle('d-none', isExw));
	document.querySelectorAll('.col-usd').forEach(el => 
		el.classList.toggle('d-none', isExw));
	
	// Show/hide table sections
	if ($('wrapper-standard-tables')) 
		$('wrapper-standard-tables').classList.toggle('d-none', isTC);
	if ($('wrapper-tc-cost-table')) 
		$('wrapper-tc-cost-table').classList.toggle('d-none', !isTC);
	
	const isIndCif = variant === 'India-CIF';
	const isIndExport = variant.startsWith('India-') && !variant.includes('EXW');
	
	const cnfTableEl = $('wrapper-ind-cnf-table');
	if (cnfTableEl) cnfTableEl.classList.toggle('d-none', !isIndExport);
	
	const freightTableEl = $('wrapper-tc-freight-table');
	if (freightTableEl) {
		freightTableEl.classList.toggle('d-none', !(isTCFob || isIndCif));
	}
	
	// Update benefit rows visibility
	document.querySelectorAll('.col-benefits').forEach(el => 
		el.classList.toggle('d-none', !isExport || isTC || !isRodtepActive || isAdvLicense));
	
	updateStuffingLoc();
	calculateEngine();
}

// Main calculation engine
function calculateEngine() {
	const variant = $('inp_master_cs_type').value;
	const isTC = variant.startsWith('TC-');
	const isTCFob = variant === 'TC-FOB';
	const isIndCif = variant === 'India-CIF';
	const isIndExport = isIndiaExportVariant(variant);
	const isExw = isExwVariant(variant);
	const isDomestic = variant === 'India-Domestic-EXW';
	const isMerchant = variant === 'India-Merchant-EXW';
	const isRepack = variant === 'India-Repacking Service-EXW';
	
	// Get basic parameters
	const unitKg = v('inp_unit_size');
	const unitsFcl = parseFloat($('inp_units_per_fcl')?.value) || 20;
	const totalFcl = v('inp_total_fcl');
	const qtyFcl = (unitsFcl * unitKg) / 1000;
	const totalMt = qtyFcl * totalFcl;
	
	if ($('lbl-qty-fcl-box')) $('lbl-qty-fcl-box').value = qtyFcl.toFixed(2);
	if ($('lbl-total-mt-box')) $('lbl-total-mt-box').value = totalMt.toFixed(2);
	setTxt('kpi_weight', totalMt, 2);
	if ($('lbl-rp-weight')) $('lbl-rp-weight').textContent = `${totalMt.toFixed(2)} MT`;
	
	if (totalMt <= 0) return;
	
	// Exchange rate calculations
	const baseRate = v('inp_base_rate');
	const premium = v('inp_premium');
	const csExr = baseRate - premium;
	if ($('lbl-cs-exr')) $('lbl-cs-exr').value = csExr.toFixed(2);
	
	let primaryBuyTotalRs = 0;
	let seaFreightTotalRs = 0;
	let baseCostForPercentRs = 0;
	let baseCostForPercentMtRs = 0;
	
	// Calculate based on variant type
	if (isTC) {
		// Third Country calculations
		const buyUsdMt = v('inp_tc_usd_mt');
		const buyTotalUsd = buyUsdMt * totalMt;
		const buyRsMt = buyUsdMt * csExr;
		primaryBuyTotalRs = buyTotalUsd * csExr;
		baseCostForPercentRs = primaryBuyTotalRs;
		baseCostForPercentMtRs = buyRsMt;
		
		setTxt('lbl-tc-buy-tot', primaryBuyTotalRs);
		setTxt('lbl-tc-buy-mt', buyRsMt);
		setTxt('lbl-tc-buy-utot', buyTotalUsd);
	} else {
		// India-based calculations
		// ... (product cost calculations would go here)
	}
	
	// Sea freight calculations for TC-FOB and India-CIF
	if (isTCFob || isIndCif) {
		const shipPremium = v('inp_ship_premium');
		const shipExr = csExr + shipPremium;
		if ($('lbl_tc_ship_exr')) $('lbl_tc_ship_exr').value = shipExr.toFixed(2);
		
		const sfFclUsd = v('inp_tc_sf_fcl') + v('inp_tc_sf_haz');
		const sfTotalUsd = sfFclUsd * totalFcl;
		const sfTotalRs = sfTotalUsd * shipExr;
		const vanTotalUsd = v('inp_tc_van_usd');
		const vanTotalRs = vanTotalUsd * shipExr;
		seaFreightTotalRs = sfTotalRs + vanTotalRs;
		
		setTxt('lbl-tc-sf-rs-tot', sfTotalRs);
		setTxt('lbl-tc-sf-rs-mt', sfTotalRs / totalMt);
		setTxt('lbl-tc-sf-usd-tot', sfTotalUsd);
		setTxt('lbl-tc-sf-usd-mt', sfTotalUsd / totalMt, 1);
	}
	
	// Final price and margin calculations
	const offInputVal = isExw ? v('inp_offered_price_exw') : v('inp_offered_price');
	const offeredMtRs = isExw ? offInputVal : offInputVal * csExr;
	const offeredMtUsd = isExw ? offInputVal / csExr : offInputVal;
	const offeredTotalRs = offeredMtRs * totalMt;
	const offeredTotalUsd = offeredMtUsd * totalMt;
	
	setTxt('lbl-off-tot', offeredTotalRs);
	setTxt('lbl-off-mt', offeredMtRs);
	setTxt('lbl-off-utot', offeredTotalUsd);
	setTxt('kpi_off', isExw ? offeredMtRs : offeredMtUsd, 1);
	if ($('lbl-rp-off')) $('lbl-rp-off').textContent = isExw ? 
		`Rs. ${offeredMtRs.toFixed(2)}` : `$${offeredMtUsd.toFixed(2)}`;
	
	// Update KPI footer
	updateKPIFooter();
}

// Update KPI footer
function updateKPIFooter() {
	// KPI updates would go here
}

// Save cost sheet to ERPNext
async function saveCostSheet() {
	try {
		const costSheetData = collectFormData();
		
		frappe.call({
			method: 'sukha.sukha.page.cost_sheet_engine.save_cost_sheet',
			args: {
				data: costSheetData
			},
			callback: function(r) {
				if (r.message) {
					frappe.msgprint(__('Cost Sheet saved successfully'));
					window.location.href = `/app/cost-sheet/${r.message}`;
				}
			}
		});
	} catch (error) {
		console.error('Error saving cost sheet:', error);
		frappe.msgprint(__('Error saving cost sheet'));
	}
}

// Collect form data
function collectFormData() {
	return {
		cost_sheet_type: $('inp_master_cs_type')?.value,
		incoterm: $('inp_incoterm')?.value,
		origin_scope: $('inp_user_origin')?.value,
		type_of_sale: $('inp_type_of_sale')?.value,
		exw_sub_type: $('inp_exw_subtype')?.value,
		apply_rodtep: $('chk_scheme_rodtep')?.checked ? 1 : 0,
		apply_advance_license: $('chk_scheme_advance')?.checked ? 1 : 0,
		// Add more fields as needed
	};
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
	// Initialize default values
	updateContainerDefaults();
	deriveMasterVariantFromFields();
	
	// Attach event listeners
	const saveBtn = $('btn-save-cost-sheet');
	if (saveBtn) {
		saveBtn.addEventListener('click', saveCostSheet);
	}
	
	// Load existing cost sheet if editing
	const urlParams = new URLSearchParams(window.location.search);
	const costSheetName = urlParams.get('name');
	if (costSheetName) {
		loadCostSheet(costSheetName);
	}
});

// Load existing cost sheet
async function loadCostSheet(name) {
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Cost Sheet',
			name: name
		},
		callback: function(r) {
			if (r.message) {
				populateFormData(r.message);
			}
		}
	});
}

// Populate form with existing data
function populateFormData(data) {
	// Populate form fields with data
	if ($('lbl-cost-sheet-id')) $('lbl-cost-sheet-id').textContent = data.name;
	// Add more field population as needed
}
