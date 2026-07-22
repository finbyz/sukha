# Copyright (c) 2026
# cost_sheet.py

import frappe
from frappe.model.document import Document
from frappe.utils import flt, cstr


VARIANT_MAP = {
    "India CIF": "India-CIF",
    "India FOB": "India-FOB",
    "TC CIF": "TC-CIF",
    "TC FOB": "TC-FOB",
    "Domestic": "India-Domestic-EXW",
    "Merchant Export": "India-Merchant-EXW"
}

EXW_SUBTYPE_MAP = {
    "Domestic Sale":"India-Domestic-EXW",
    "Merchant Export":"India-Merchant-EXW",
    "Repacking Service":"India-Repacking Service-EXW"
}

CREDIT_DAYS_MAP = {
    "LC at Sight":0,
    "30 Days Credit":30,
    "60 Days Credit":60,
    "90 Days Credit":90
}


def get_variant(doc):

    cs_type = cstr(doc.cost_sheet_type)

    if cs_type == "India EXW":
        return EXW_SUBTYPE_MAP.get(
            cstr(doc.exw_sub_type),
            "India-Domestic-EXW"
        )

    return VARIANT_MAP.get(
        cs_type,
        "India-CIF"
    )


class CostSheet(Document):

    def validate(self):
        self.validate_reject_remarks()
        self.calculate()
        self.sync_status()


    def on_cancel(self):
        self.db_set("workflow_state", "Cancelled")
        self.db_set("status", "Cancelled")


    def sync_status(self):
        mapping = {
            "Draft": "Draft",
            "Pending Sales Manager Approval": "Submitted",
            "Approved by Sales Manager": "Submitted",
            "Pending Director of Sales Approval": "Submitted",
            "Approved by Director of Sales": "Approved",
        }
        if self.docstatus == 2:
            self.status = "Cancelled"
        elif self.workflow_state:
            self.status = mapping.get(self.workflow_state, self.status)


    def validate_reject_remarks(self):

        if self.workflow_state == "Draft" and not self.is_new():

            previous = frappe.db.get_value(
                "Cost Sheet", self.name, "workflow_state"
            )

            if previous in (
                "Pending Sales Manager Approval",
                "Pending Director of Sales Approval"
            ) and not self.remarks:

                frappe.throw(
                    "Remarks are mandatory when rejecting a Cost Sheet."
                )


    def calculate(self):

        variant = get_variant(self)

        is_tc = variant.startswith("TC-")
        is_ind_export = variant in [
            "India-CIF",
            "India-FOB"
        ]

        is_exw = variant in [
            "India-Domestic-EXW",
            "India-Merchant-EXW",
            "India-Repacking Service-EXW"
        ]

        is_fob = cstr(self.incoterm) == "FOB"

        self.calculate_exchange()
        # self.calculate_quantity()

        if self.total_weight_mt <= 0:
            self.zero_totals()
            return

        self.calculate_product_cost(is_tc)          # CHANGED: pass is_tc
        self.calculate_cnf()
        self.calculate_freight()
        self.calculate_margin(is_exw, is_ind_export, is_tc, is_fob)  # CHANGED
        self.calculate_summary()


    def calculate_exchange(self):

        base = flt(self.exchange_rate)

        premium = flt(
            self.exchange_premium
        )

        # Effective rate = base - premium, matching the frontend engine
        # (cost_sheet.html: csExr = baseRate - premium)
        self.effective_exchange_rate = (
            base - premium
        )



    # def calculate_quantity(self):

    #     qty_per_fcl = (

    #         flt(self.units_per_fcl)

    #         *

    #         flt(self.packing_unit_size)

    #     ) / 1000


    #     total_mt = (
    #         qty_per_fcl *
    #         flt(self.total_fcl)
    #     )


    #     self.total_quantity = flt(total_mt, 3)
    #     self.total_weight_mt = flt(total_mt, 3)



    def calculate_product_cost(self, is_tc=False):

        total = 0

        exr = self.effective_exchange_rate or 1
        mt = self.total_weight_mt or 1

        for row in self.product_cost_details:

            # if flt(row.quantity):
            #     row.amount = flt(row.quantity) * flt(row.rate)

            # row.amount = flt(row.amount)
            # row.amount_per_mt = row.amount / mt

            # if row.currency == "USD":
            #     row.usd_amount = row.amount
            # else:
            #     row.usd_amount = row.amount / exr

            # row.usd_per_mt = row.usd_amount / mt

            total += row.amount


        if is_tc and not self.product_cost_details and flt(self.tc_rm_usd_mt):
            buy_usd_mt = flt(self.tc_rm_usd_mt)
            buy_total_rs = buy_usd_mt * mt * exr

            row = self.append("product_cost_details", {})
            row.cost_element = "RM Delivered Cost (TC Buy)"
            row.category = "Raw Material"
            row.currency = "USD"
            row.rate = buy_usd_mt
            row.amount = buy_total_rs
            row.amount_per_mt = buy_total_rs / mt
            row.usd_amount = buy_usd_mt * mt
            row.usd_per_mt = buy_usd_mt

            total += buy_total_rs

        # self.total_product_cost = total

    def calculate_cnf(self):

        exr = self.effective_exchange_rate or 1
        mt = self.total_weight_mt or 1
        total_fcl = flt(self.total_fcl)

        # for row in self.cnf_charges:
        #     if flt(row.quantity):
        #         row.amount = flt(row.quantity) * flt(row.rate)
        #     row.amount = flt(row.amount)
        #     if row.bl_charges_total:
        #         row.bl_charges_per_mt = flt(row.bl_charges_total) / mt
        #         row.bl_charges_usd = flt(row.bl_charges_total) / exr
        #     row.amount_per_mt = row.amount / mt
        #     row.usd_amount = row.amount / exr
        #     row.usd_per_mt = row.usd_amount / mt

        std_charges_per_fcl = (
            flt(self.cnf_agency_charges)
            + flt(self.cnf_lolo_charges)
            + flt(self.cnf_seal_charges)
            + flt(self.cnf_thc)              # <-- was missing entirely
            + flt(self.cnf_port_handling)
            + flt(self.cnf_haz_surcharge)
            + flt(self.cnf_transportation)   # <-- now correctly x total_fcl below
        )
        total_cost_fcl = std_charges_per_fcl + flt(self.cnf_other_charges)
        cnf_base_rs = total_cost_fcl * total_fcl

        bl_charges = flt(self.cnf_bl_charges)
        sea_way_bl_charges = next(
            (flt(r.amount) for r in self.cnf_charges if r.charge_type == "Sea Way BL Charges"),
            0,
        )

        self.total_cnf_cost = cnf_base_rs + bl_charges + sea_way_bl_charges

    def calculate_freight(self):

        total = 0
        mt = self.total_weight_mt or 1
        base_exr = self.effective_exchange_rate or 1
        doc_ship_premium = flt(self.shipping_premium)

        for row in self.sea_freight_details:
            # ship_exr = base_exr + (flt(row.shipping_premium) or doc_ship_premium)
            # row.shipping_exchange_rate = ship_exr

            # freight_type = cstr(row.freight_type).lower()

            # if freight_type == "vanning" and flt(row.freight_amount):
            #     row.freight_amount = flt(row.freight_amount)
            # elif freight_type in ("other surcharge", "haz surcharge"):
            #     row.freight_amount = flt(row.freight_rate) * flt(row.number_of_containers) * ship_exr
            # else:
            #     row.freight_amount = (
            #         (flt(row.freight_rate) + flt(row.haz_surcharge))
            #         * flt(row.number_of_containers)
            #         * ship_exr
            #     )

            # row.freight_per_mt = row.freight_amount / mt
            # row.usd_amount = row.freight_amount / ship_exr
            total += row.freight_amount

        # NEW: tc_vanning_usd never lands in sea_freight_details rows — add it
        # directly, matching JS's `vanTotalRs = vanTotalUsd * shipExr`.
        variant = get_variant(self)
        if variant in ("TC-FOB", "India-CIF") and flt(self.tc_vanning_usd):
            ship_exr = base_exr + doc_ship_premium
            total += flt(self.tc_vanning_usd) * ship_exr

        self.total_freight_cost = total

    def calculate_margin(self, is_exw, is_ind_export, is_tc=False, is_fob=False):

        if not self.margin_analysis:
            return

        row = self.margin_analysis[0]
        exr = self.effective_exchange_rate or 1
        mt = self.total_weight_mt or 1

        base_cost = self.total_product_cost + self.total_cnf_cost
        row.base_cost = base_cost

        # ── Offered price — moved up, credit/internal cost now need it ──
        if flt(row.offered_price):
            offered = flt(row.offered_price)
        else:
            offered = flt(self.final_offered_price)
            if not is_exw:
                offered = offered * exr * mt

        # ── Credit cost / Internal cost ──────────────────────────────
        # CHANGED: JS bases these on OFFERED PRICE for CIF/FOB, and on
        # cost (exwCostRs) only for EXW variants. Previously both always
        # used base_cost, which is wrong for every non-EXW variant.
        credit_pct = flt(self.domestic_credit_percentage)
        row.credit_cost_percentage = credit_pct
        credit_cost = (base_cost if is_exw else offered) * credit_pct / 100
        internal_cost = (base_cost if is_exw else offered) * flt(row.internal_cost_percentage) / 100

        document_cost = flt(row.document_charges_usd) * exr

        if is_exw:
            commission = flt(row.commission_value) * mt
        else:
            commission = flt(row.commission_value) * mt * exr

        # ...rest of the function (dbk, rodtep, net, profit) stays unchanged

        if flt(row.offered_price):
            offered = flt(row.offered_price)
        else:
            offered = flt(self.final_offered_price)
            if not is_exw:
                offered = offered * exr * mt

        dbk = 0
        rodtep = 0

        if is_ind_export and self.apply_rodtep and not self.apply_advance_license:
            dbk_base = offered - flt(self.total_freight_cost)
            dbk = dbk_base * flt(row.duty_drawback_percentage) / 100
            rodtep = dbk_base * flt(row.rodtep_percentage) / 100

        # row.duty_drawback_amount = dbk
        # row.rodtep_amount = rodtep

        # ── Net cost — CHANGED to branch on incoterm exactly like JS ──
        # JS lines 2930-2946:
        #   FOB + TC        -> baseBuy + seaFreight + int + credit + doc + comm
        #   FOB + non-TC     -> baseBuy + int + credit + doc + comm - dbk - rodtep
        #   non-FOB (CIF/EXW)-> baseBuy + seaFreight + int + credit + doc + comm
        freight = flt(self.total_freight_cost)

        if is_fob:
            if is_tc:
                net = base_cost + freight + internal_cost + credit_cost + document_cost + commission
            else:
                net = base_cost + internal_cost + credit_cost + document_cost + commission - dbk - rodtep
        else:
            net = base_cost + freight + internal_cost + credit_cost + document_cost + commission

        # row.net_cost_total_rs = net
        # row.net_cost_per_mt_rs = net / mt

        # ── Profit — CHANGED to branch on incoterm exactly like JS ────
        # JS lines 2964-2973
        if is_fob:
            profit = offered - net
        else:
            profit = offered - net + dbk + rodtep

        # row.profit_amount = profit

        # if offered:
        #     row.profit_margin_percentage = profit / offered * 100

        # row.total_profit = profit
        # row.total_profit_usd = profit / exr


    def calculate_summary(self):

        if self.margin_analysis:
            row = self.margin_analysis[0]
            self.net_cost = flt(row.net_cost_total_rs)
            self.profit_amount = flt(row.profit_amount)
            self.profit_margin_percentage = flt(row.profit_margin_percentage)
        else:
            self.net_cost = self.total_product_cost + self.total_cnf_cost + self.total_freight_cost
            self.profit_amount = 0
            self.profit_margin_percentage = 0

    def zero_totals(self):

        # self.total_product_cost=0
        self.total_cnf_cost=0
        self.total_freight_cost=0
        self.net_cost=0
        self.profit_amount=0
        self.profit_margin_percentage=0



@frappe.whitelist()
def create_from_dashboard(data):
    import json

    if isinstance(data, str):
        data = json.loads(data)

    # ── Resolve Company ──────────────────────────────────────
    company = data.get("company")
    if not company or not frappe.db.exists("Company", company):
        match = frappe.db.get_value(
            "Company",
            {"name": ("like", f"%{company}%")} if company else {},
            "name"
        )
        data["company"] = match or frappe.defaults.get_global_default("company")

    # ── Resolve Country of Destination ───────────────────────
    dest_country = data.get("country_of_destination")
    if dest_country:
        if not frappe.db.exists("Country", dest_country):
            # It's not a valid country. Is it a Port?
            port_country = frappe.db.get_value("Port of Destinations", dest_country, "country")
            if port_country and frappe.db.exists("Country", port_country):
                data["country_of_destination"] = port_country
            else:
                # If we cannot find a valid country, clear it to avoid validation error
                data["country_of_destination"] = None

    # ── Resolve Stuffing Location ────────────────────────────
    stuffing = data.get("stuffing_location") or data.get("packing_and_stuffing_location")
    if stuffing:
        if frappe.db.exists("Warehouse", stuffing):
            if data.get("stuffing_at") == "Warehouse":
                data["stuffing_warehouse"] = stuffing
        else:
            match = frappe.db.get_value(
                "Warehouse",
                {"name": ("like", f"%{stuffing}%")},
                "name"
            )
            if match:
                if "stuffing_location" in data:
                    data["stuffing_location"] = match
                if "packing_and_stuffing_location" in data:
                    data["packing_and_stuffing_location"] = match
                if data.get("stuffing_at") == "Warehouse":
                    data["stuffing_warehouse"] = match

    # ── Normalize EXW Sub-Type ───────────────────────────────
    EXW_SUBTYPE_MAP = {
        "domestic"          : "Domestic Sale",
        "domestic sale"     : "Domestic Sale",
        "merchant"          : "Merchant Export",
        "merchant export"   : "Merchant Export",
        "repacking"         : "Repacking Service",
        "repacking service" : "Repacking Service",
    }
    exw_subtype = data.get("exw_sub_type") or ""
    data["exw_sub_type"] = EXW_SUBTYPE_MAP.get(
        exw_subtype.strip().lower(), ""
    )

    # ── Normalize Packing & Stuffing At ──────────────────────

    stuffat = (data.get("stuffing_at") or data.get("packing_and_stuffat") or "")
    stuffat = stuffat.strip().lower()

    # Normalize special characters and spaces
    stuffat = (
        stuffat.replace("-", " ")
                .replace("—", " ")
    )

    stuffat = " ".join(stuffat.split())


    if not stuffat:
        data["stuffing_at"] = ""

    elif "panoli" in stuffat:
        data["stuffing_at"] = "Own Warehouse — Panoli"

    elif "mundra" in stuffat:
        data["stuffing_at"] = "Own Warehouse — Mundra"

    elif "supplier" in stuffat:
        data["stuffing_at"] = "Supplier's Place"

    elif "cfs" in stuffat or "icd" in stuffat:
        data["stuffing_at"] = "CFS / ICD"

    else:
        data["stuffing_at"] = ""

    # ── Normalize Supplier Payment Terms ──────────────────────
    # We no longer normalize this since it's a Link field and the dashboard
    # passes the exact value selected from the Payment Terms Template dropdown.
    supplier_payment = data.get("supplier_payment_terms") or ""
    data["supplier_payment_terms"] = supplier_payment
    
    # ── Clean child tables ───────────────────────────────────
    if data.get("margin_analysis"):
        data["margin_analysis"] = [
            row for row in data["margin_analysis"]
            if row.get("analysis_type")
        ]

    for key, val in data.items():
        if isinstance(val, list):
            data[key] = [
                row for row in val
                if isinstance(row, dict) and any(
                    v not in (None, "", []) for k, v in row.items()
                    if k not in ("doctype", "parenttype", "parentfield", "idx")
                )
            ]

    if data.get("name"):
        # Update existing
        doc = frappe.get_doc("Cost Sheet", data.get("name"))
        doc.check_permission("write")
        # Clear child tables to replace them
        doc.set("product_cost_details", [])
        doc.set("cnf_charges", [])
        doc.set("sea_freight_details", [])
        doc.set("margin_analysis", [])
        doc.update(data)
        doc.save()
    else:
        # Create new
        doc = frappe.new_doc("Cost Sheet")
        doc.update(data)
        doc.insert()

    # frappe.db.commit()

    # ── Create Quotation simultaneously ──────────────────────────
    # quotation_name = None
    # try:
    #     quotation_name = create_quotation_from_cost_sheet(doc)
    #     frappe.db.commit()
    # except Exception as e:
    #     frappe.log_error(
    #         message=frappe.get_traceback(),
    #         title=f"Quotation creation failed for Cost Sheet {doc.name}"
    #     )

    return {
        "cost_sheet": doc.name,
    }


@frappe.whitelist()
def get_dashboard_workflow_transitions(doc):
    from frappe.model.workflow import (
        WorkflowStateError,
        get_transitions,
        get_workflow,
        get_workflow_name,
    )

    doc = frappe.parse_json(doc)
    doctype = doc.get("doctype") or "Cost Sheet"
    name = doc.get("name")

    if doctype != "Cost Sheet":
        frappe.throw("Invalid doctype for Cost Sheet workflow lookup.")

    workflow_name = get_workflow_name(doctype)

    if not workflow_name:
        return {
            "has_workflow": False,
            "transitions": [],
            "workflow": None,
        }

    workflow = get_workflow(doctype)
    workflow_doc = frappe.get_doc(doctype, name) if name else frappe.get_doc(doc)

    try:
        transitions = get_transitions(workflow_doc, workflow, raise_exception=True)
    except WorkflowStateError:
        transitions = []

    normalized_transitions = []
    for transition in transitions:
        if hasattr(transition, "as_dict") and callable(transition.as_dict):
            normalized_transitions.append(transition.as_dict())
        else:
            normalized_transitions.append(dict(transition))

    return {
        "has_workflow": True,
        "transitions": normalized_transitions,
        "workflow": {
            "name": workflow.name,
            "workflow_state_field": workflow.workflow_state_field,
            "enable_action_confirmation": workflow.enable_action_confirmation,
        },
    }

import frappe
from frappe.utils import cstr, flt


@frappe.whitelist()
def create_quotation_from_cost_sheet(cost_sheet):
    """
    Create a Quotation from Cost Sheet.
    If a quotation already exists for this Cost Sheet, return it.
    """

    # ---------------------------------
    # Check if quotation already exists
    # ---------------------------------
    existing_quotation = frappe.db.get_value(
        "Quotation Item",
        {"custom_cost_sheet": cost_sheet},
        "parent"
    )

    if existing_quotation:
        return {
            "quotation": existing_quotation,
            "already_exists": 1
        }

    doc = frappe.get_doc("Cost Sheet", cost_sheet)

    # ---------------------------------
    # Determine Party
    # ---------------------------------
    customer = cstr(doc.customer).strip()
    lead = cstr(doc.lead).strip()

    if customer:
        quotation_to = "Customer"
        party_name = customer
        customer_name = (
            frappe.db.get_value("Customer", customer, "customer_name")
            or customer
        )
    elif lead:
        quotation_to = "Lead"
        party_name = lead
        customer_name = (
            frappe.db.get_value("Lead", lead, "lead_name")
            or lead
        )
    else:
        frappe.throw("Please select Customer or Lead before creating a Quotation.")

    product = cstr(doc.product).strip()

    if not product:
        frappe.throw("Please select a Product before creating a Quotation.")

    qty = flt(doc.total_quantity) or flt(doc.total_weight_mt) or 1

    # ---------------------------------
    # Create Quotation
    # ---------------------------------
    quotation = frappe.new_doc("Quotation")

    quotation.quotation_to = quotation_to
    quotation.party_name = party_name
    quotation.customer_name = customer_name

    if doc.company:
        quotation.company = doc.company

    if doc.currency:
        quotation.currency = doc.currency

    if doc.customer_payment_terms:
        quotation.payment_terms_template = doc.customer_payment_terms

    if doc.incoterm:
        quotation.incoterm = doc.incoterm

    # ---------------------------------
    # Add Item
    # ---------------------------------
    quotation.append("items", {
        "item_code": product,
        "qty": qty,
        "uom": frappe.db.get_value("Item", product, "stock_uom") or "MT",
        "rate": doc.final_offered_price or 0,

        # Custom fields on Quotation Item
        "custom_cost_sheet": doc.name,
        "custom_exw_subtype": doc.exw_sub_type,
        "custom_packing_type": doc.packing_type,
        "custom_standard_packing": doc.custom_std_pakcing,
        "custom_packing_unit_size": doc.packing_unit_size,
        "custom_final_country_of_destination": doc.final_country_of_destination,
    })

    quotation.insert(ignore_permissions=True)

    return {
        "quotation": quotation.name,
        "already_exists": 0
    }