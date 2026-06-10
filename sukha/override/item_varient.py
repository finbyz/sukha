import json
import frappe
from frappe import _

from erpnext.controllers.item_variant import (
    copy_attributes_to_variant,
    get_variant,
    generate_keyed_value_combinations,
)


def get_grade_value(variant):
    """Get Grade attribute value from variant"""

    for row in variant.attributes:
        if row.attribute == "Grade":
            return row.attribute_value

    return None


def create_or_get_product_grade(grade):
    """Create Product Grade if not exists"""

    if not grade:
        return None

    existing = frappe.db.exists("Product Grades", grade)

    if existing:
        return existing

    doc = frappe.get_doc({
        "doctype": "Product Grades",
        "grade_name": grade
    })

    doc.insert(ignore_permissions=True)

    return doc.name


def set_variant_name_from_grade(template, variant):
    """Naming only based on Grade"""

    grade = get_grade_value(variant)

    if not grade:
        return

    variant.item_code = f"{template.item_code}-{grade}"
    variant.item_name = f"{template.item_name}-{grade}"


@frappe.whitelist()
def create_variant(item, args, use_template_image=False):

    if isinstance(args, str):
        args = json.loads(args)

    template = frappe.get_doc("Item", item)

    variant = frappe.new_doc("Item")
    variant.variant_based_on = "Item Attribute"

    variant_attributes = []

    for d in template.attributes:
        val = args.get(d.attribute) or args.get(_(d.attribute))
        variant_attributes.append({
            "attribute": d.attribute,
            "attribute_value": val
        })

    variant.set("attributes", variant_attributes)

    copy_attributes_to_variant(template, variant)

    if use_template_image and template.image:
        variant.image = template.image

    # custom naming
    set_variant_name_from_grade(template, variant)

    # create product grade
    grade = get_grade_value(variant)

    if grade:
        grade_doc = create_or_get_product_grade(grade)
        variant.custom_item_grade = grade_doc

    variant.insert(ignore_permissions=True)

    return variant


@frappe.whitelist()
def create_multiple_variants(item, args, use_template_image=False):

    count = 0

    if isinstance(args, str):
        args = json.loads(args)

    template = frappe.get_doc("Item", item)

    args_set = generate_keyed_value_combinations(args)

    for attribute_values in args_set:

        if not get_variant(item, args=attribute_values):
            try:
                create_variant(item, attribute_values, use_template_image)
                count += 1
            except Exception as e:
                frappe.log_error(message=frappe.get_traceback(), title="Variant Creation Failed")

    return count


@frappe.whitelist()
def enqueue_multiple_variant_creation(item, args, use_template_image=False):

    use_template_image = frappe.parse_json(use_template_image)

    if isinstance(args, str):
        variants = json.loads(args)
    else:
        variants = args

    total_variants = 1

    for key in variants:
        total_variants *= len(variants[key])

    if total_variants >= 600:
        frappe.throw("Please do not create more than 500 items at a time")

    if total_variants < 10:
        return create_multiple_variants(
            item,
            args,
            use_template_image
        )

    frappe.enqueue(
        "sukha.override.item_varient.create_multiple_variants",
        item=item,
        args=args,
        use_template_image=use_template_image,
        now=frappe.in_test,
    )

    return "queued"