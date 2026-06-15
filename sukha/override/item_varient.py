import json
import frappe
from frappe import _

from erpnext.controllers.item_variant import (
    copy_attributes_to_variant,
    get_variant,
    generate_keyed_value_combinations,
    make_variant_item_code
)

def get_grade_attribute_name(template=None):
    """
    Returns the grade attribute name if present in the template.
    Otherwise returns the first attribute from the template.
    """

    grade_attribute = frappe.db.get_value(
        "Item Attribute",
        {"custom_product_grade_attribute": 1},
        "attribute_name"
    )

    if not template:
        return grade_attribute

    template_attributes = [d.attribute for d in template.attributes]

    # If configured grade attribute exists in template, use it
    if grade_attribute and grade_attribute in template_attributes:
        return grade_attribute

    # Otherwise use first available attribute
    return template_attributes[0] if template_attributes else None

def get_grade_value(variant, template=None):
    grade_attribute = get_grade_attribute_name(template)

    if not grade_attribute:
        return None

    for row in variant.attributes:
        if row.attribute == grade_attribute:
            return row.attribute_value

    return None


def create_or_get_product_grade(grade):
    if not grade:
        return None
    existing = frappe.db.exists("Product Grades", {"grade_name": grade})
    if existing:
        return existing

    doc = frappe.get_doc({
        "doctype": "Product Grades",
        "grade_name": grade
    })
    doc.insert(ignore_permissions=True)
    return doc.name


def set_variant_name_from_grade(template, variant):
    grade = get_grade_value(variant, template)
    grade_attribute = get_grade_attribute_name(template)

    if not grade:
        make_variant_item_code(template.item_code, template.item_name, variant)
        return

    # Collect non-grade attribute values to ensure uniqueness
    # when multiple attributes are present (e.g. Colour + Grade)
    non_grade_parts = [
        row.attribute_value
        for row in variant.attributes
        if row.attribute != grade_attribute and row.attribute_value
    ]

    base_code = f"{template.item_code}-{grade}"
    base_name = f"{template.item_name}-{grade}"

    if non_grade_parts:
        suffix = "-".join(non_grade_parts)
        base_code = f"{base_code}-{suffix}"
        base_name = f"{base_name} {suffix}"

    proposed_code = base_code
    proposed_name = base_name
    counter = 1

    while frappe.db.exists("Item", proposed_code):
        proposed_code = f"{base_code}-{counter}"
        proposed_name = f"{base_name} {counter}"
        counter += 1

    variant.item_code = proposed_code
    variant.item_name = proposed_name

@frappe.whitelist()
def create_variant(item, args, use_template_image=False):
    
    """
    Create a single item variant.

    Standard ERPNext flow is fully preserved:
    - All template attributes are iterated and set on the variant.
    - copy_attributes_to_variant copies defaults from the template.

    Grade enhancement (additive, does NOT skip non-grade attributes):
    - If any attribute is marked with custom_product_grade_attribute, its value
      is used to name the variant and create/link a Product Grades record.
    - If no such attribute is marked, pure standard flow applies.
    - If multiple attributes are selected by the user, all are set; only the
      grade-marked attribute drives the grade name and Product Grades doc.
    """
    args = frappe.parse_json(args)

    template = frappe.get_doc("Item", item)
    variant = frappe.new_doc("Item")
    variant.variant_based_on = "Item Attribute"

    # --- Standard flow: set ALL template attributes ---
    variant_attributes = []
    for d in template.attributes:
        val = args.get(d.attribute) or args.get(_(d.attribute))
        if val:  # Only add if a value exists
            variant_attributes.append({
                "attribute": d.attribute,
                "attribute_value": val
            })

    variant.set("attributes", variant_attributes)
    copy_attributes_to_variant(template, variant)

    if use_template_image and template.image:
        variant.image = template.image

    # --- Grade enhancement (does NOT affect non-grade attributes) ---
    # Naming: if a grade attribute is configured, use grade-based naming;
    # otherwise fall back to standard ERPNext naming.
    set_variant_name_from_grade(template, variant)

    # Grade field: only set custom_item_grade when a grade attribute is configured.
    grade = get_grade_value(variant, template)
    if grade:
        grade_doc = create_or_get_product_grade(grade)
        variant.custom_item_grade = grade_doc

    variant.insert(ignore_permissions=True)
    return variant


@frappe.whitelist()
def create_multiple_variants(item, args, use_template_image=False):
    """
    Create multiple item variants with dynamic grade attribute support.

    Standard flow is fully preserved:
    - generate_keyed_value_combinations produces every combination of the
      selected attribute values (same as ERPNext core).
    - Each combination is passed to create_variant which handles all attributes.

    Grade enhancement (additive):
    - The grade attribute (if configured) is used only for logging and for
      naming/grade-doc assignment inside create_variant.
    - Non-grade attributes are NOT skipped — all selected attributes participate
      in combination generation as normal.

    Validation:
    - Only one attribute may be marked as 'Product Grade Attribute'. This is
      enforced inside get_grade_attribute_name() and will throw before any
      variants are created.
    """
    # Validate grade attribute configuration upfront (throws if >1 marked)
    template = frappe.get_doc("Item", item)
    grade_attribute = get_grade_attribute_name(template)

    created_count = 0
    skipped_count = 0
    failed_count = 0
    log = []

    parsed_args = frappe.parse_json(args)

    # Strip out any keys that have empty lists so they don't break the math
    clean_args = {k: v for k, v in parsed_args.items() if v and len(v) > 0}

    # Standard ERPNext: generate ALL combinations across ALL selected attributes
    args_set = generate_keyed_value_combinations(clean_args)

    for attribute_values in args_set:
        existing_variant = get_variant(item, args=attribute_values)

        # For log display: show grade value if available, otherwise show all values
        if grade_attribute and grade_attribute in attribute_values:
            display_value = attribute_values.get(grade_attribute, 'Unknown')
        else:
            display_value = ", ".join(
                f"{k}={v}" for k, v in attribute_values.items()
            )

        if existing_variant:
            skipped_count += 1
            log.append(f"<b>Skipped:</b> {display_value} (Already exists as {existing_variant})")
        else:
            try:
                create_variant(item, attribute_values, use_template_image)
                created_count += 1
                log.append(f"<b>Success:</b> Created variant for {display_value}")
            except Exception as e:
                frappe.db.rollback()
                failed_count += 1
                error_msg = frappe.get_traceback()
                frappe.log_error(title=f"Variant Creation Failed: {display_value}", message=error_msg)
                log.append(
                    f"<span style='color:red'><b>Failed:</b> {display_value} -> Error: {str(e)}</span>"
                )

    return f"{created_count} variants created."


@frappe.whitelist()
def enqueue_multiple_variant_creation(item, args, use_template_image=False):
    use_template_image = frappe.parse_json(use_template_image)
    parsed_args = frappe.parse_json(args)

    # Validate grade attribute configuration upfront before doing any work
    template = frappe.get_doc("Item", item)
    get_grade_attribute_name(template)

    # Clean the args for the length check
    clean_args = {k: v for k, v in parsed_args.items() if v and len(v) > 0}

    if not clean_args:
        frappe.throw(_("Please select at least one attribute value to create variants."))

    total_variants = 1
    for key in clean_args:
        total_variants *= len(clean_args[key])

    if total_variants >= 600:
        frappe.throw(_("Please do not create more than 500 items at a time"))

    if total_variants < 10:
        # Pass the original parsed_args, create_multiple_variants will clean them
        return create_multiple_variants(item, parsed_args, use_template_image)

    frappe.enqueue(
        "sukha.override.item_varient.create_multiple_variants",
        item=item,
        args=parsed_args,
        use_template_image=use_template_image,
        now=frappe.in_test,
    )

    return "queued"