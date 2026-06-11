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
        self.calculate()


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


        self.calculate_exchange()
        self.calculate_quantity()


        if self.total_weight_mt <= 0:
            self.zero_totals()
            return


        self.calculate_product_cost()

        self.calculate_cnf()

        self.calculate_freight()

        self.calculate_margin(
            is_exw,
            is_ind_export
        )

        self.calculate_summary()



    def calculate_exchange(self):

        base = flt(self.exchange_rate)

        premium = flt(
            self.exchange_premium
        )

        # use + because your doctype description uses +
        self.effective_exchange_rate = (
            base + premium
        )



    def calculate_quantity(self):

        qty_per_fcl = (

            flt(self.units_per_fcl)

            *

            flt(self.packing_unit_size)

        ) / 1000


        total_mt = (
            qty_per_fcl *
            flt(self.total_fcl)
        )


        self.total_quantity = total_mt
        self.total_weight_mt = total_mt



    def calculate_product_cost(self):

        total=0

        exr=self.effective_exchange_rate or 1

        mt=self.total_weight_mt or 1


        for row in self.product_cost_details:


            row.amount=(

                flt(row.quantity)

                *

                flt(row.rate)

            )


            row.amount_per_mt=(
                row.amount/mt
            )


            if row.currency=="USD":

                row.usd_amount=row.amount

            else:

                row.usd_amount=(
                    row.amount/exr
                )


            row.usd_per_mt=(
                row.usd_amount/mt
            )


            total+=row.amount


        self.total_product_cost=total



    def calculate_cnf(self):

        total=0

        exr=self.effective_exchange_rate or 1

        mt=self.total_weight_mt or 1


        for row in self.cnf_charges:


            row.amount=(

                flt(row.quantity)

                *

                flt(row.rate)

            )


            if row.bl_charges_total:

                row.amount += flt(
                    row.bl_charges_total
                )


                row.bl_charges_per_mt=(

                    flt(
                        row.bl_charges_total
                    )

                    /mt
                )


                row.bl_charges_usd=(

                    flt(
                        row.bl_charges_total
                    )

                    /exr
                )


            row.amount_per_mt=(
                row.amount/mt
            )


            row.usd_amount=(
                row.amount/exr
            )


            row.usd_per_mt=(

                row.usd_amount/mt
            )


            total += row.amount


        self.total_cnf_cost=total



    def calculate_freight(self):

        total=0

        mt=self.total_weight_mt or 1

        base_exr=self.exchange_rate or 1


        for row in self.sea_freight_details:


            ship_exr=(

                base_exr

                +

                flt(
                    row.shipping_premium
                )
            )


            row.shipping_exchange_rate=(
                ship_exr
            )


            row.freight_amount=(

                (

                    flt(
                        row.freight_rate
                    )

                    +

                    flt(
                        row.haz_surcharge
                    )

                )

                *

                flt(
                    row.number_of_containers
                )

                *

                ship_exr

            )


            row.freight_per_mt=(

                row.freight_amount/mt

            )


            row.usd_amount=(

                row.freight_amount
                /
                ship_exr

            )


            total += row.freight_amount


        self.total_freight_cost=total




    def calculate_margin(
        self,
        is_exw,
        is_ind_export
    ):


        if not self.margin_analysis:
            return


        row=self.margin_analysis[0]

        exr=self.effective_exchange_rate or 1

        mt=self.total_weight_mt or 1


        base_cost=(

            self.total_product_cost

            +

            self.total_cnf_cost

            +

            self.total_freight_cost

        )


        row.base_cost=base_cost


        credit_days=CREDIT_DAYS_MAP.get(
            cstr(
                row.credit_days
            ),
            0
        )


        credit_pct=(
            credit_days/30
        )


        row.credit_cost_percentage=(
            credit_pct
        )


        internal_cost=(

            base_cost

            *

            flt(
                row.internal_cost_percentage
            )

            /100
        )


        credit_cost=(

            base_cost

            *

            credit_pct

            /100
        )


        document_cost=(

            flt(
                row.document_charges_usd
            )

            *

            exr
        )


        if is_exw:

            commission=(

                flt(
                    row.commission_value
                )

                *

                mt
            )

        else:

            commission=(

                flt(
                    row.commission_value
                )

                *

                mt

                *

                exr
            )


        offered=flt(
            self.final_offered_price
        )


        if not is_exw:

            offered=(
                offered
                *
                exr
                *
                mt
            )


        dbk=0
        rodtep=0


        if (
            is_ind_export
            and
            self.apply_rodtep
            and
            not self.apply_advance_license
        ):


            dbk=(

                offered

                *

                flt(
                    row.duty_drawback_percentage
                )

                /100
            )


            rodtep=(

                offered

                *

                flt(
                    row.rodtep_percentage
                )

                /100
            )


        row.duty_drawback_amount=dbk

        row.rodtep_amount=rodtep


        net=(

            base_cost

            +

            internal_cost

            +

            credit_cost

            +

            document_cost

            +

            commission

            -

            dbk

            -

            rodtep
        )


        row.net_cost_total_rs=net

        row.net_cost_per_mt_rs=(
            net/mt
        )

        row.net_cost_total_usd=(
            net/exr
        )

        row.net_cost_per_mt_usd=(

            net
            /
            mt
            /
            exr
        )


        profit=(
            offered-net
        )


        row.profit_amount=profit


        if offered:

            row.profit_margin_percentage=(

                profit
                /
                offered
                *
                100
            )


        row.total_profit=profit

        row.total_profit_usd=(
            profit/exr
        )



    def calculate_summary(self):

        self.net_cost=(

            self.total_product_cost

            +

            self.total_cnf_cost

            +

            self.total_freight_cost

        )


        self.profit_amount=(

            flt(
                self.final_offered_price
            )

            -

            flt(
                self.net_cost
            )

        )


        if self.final_offered_price:

            self.profit_margin_percentage=(

                self.profit_amount

                /

                self.final_offered_price

            ) * 100



    def zero_totals(self):

        self.total_product_cost=0
        self.total_cnf_cost=0
        self.total_freight_cost=0
        self.net_cost=0
        self.profit_amount=0
        self.profit_margin_percentage=0




# @frappe.whitelist()
# def create_from_dashboard(data):

#     import json

#     if isinstance(data,str):
#         data=json.loads(data)


#     doc=frappe.new_doc(
#         "Cost Sheet"
#     )


#     doc.update(data)

#     doc.insert(
#         ignore_permissions=True
#     )

#     frappe.db.commit()

#     return doc.name

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

    # ── Resolve Stuffing Location ────────────────────────────
    stuffing = data.get("stuffing_location") or data.get("packing_and_stuffing_location")
    if stuffing and not frappe.db.exists("Warehouse", stuffing):
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
    PAYMENT_TERMS_MAP = {
        "advance": "Advance Payment",
        "advance payment": "Advance Payment",
        "30 days": "30 Days against B/L",
        "30 days against b/l": "30 Days against B/L",
        "lc": "LC at Sight",
        "lc at sight": "LC at Sight"
    }

    supplier_payment = (
        data.get("supplier_payment_terms") or ""
    ).strip().lower()

    data["supplier_payment_terms"] = PAYMENT_TERMS_MAP.get(
        supplier_payment,
        ""
    )
    
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
        # Clear child tables to replace them
        doc.set("product_cost_details", [])
        doc.set("cnf_charges", [])
        doc.set("sea_freight_details", [])
        doc.set("margin_analysis", [])
        doc.update(data)
        doc.save(ignore_permissions=True)
    else:
        # Create new
        doc = frappe.new_doc("Cost Sheet")
        doc.update(data)
        doc.insert(ignore_permissions=True)

    frappe.db.commit()
    return doc.name