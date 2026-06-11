import json
import frappe
from frappe import _

from erpnext.controllers.item_variant import (
    copy_attributes_to_variant,
    get_variant,
    generate_keyed_value_combinations,
    make_variant_item_code
)

def get_grade_attribute_name():
    """
    Get the dynamic grade attribute name based on custom_product_grade_attribute flag
    Returns the attribute name (e.g., 'Grade') or None if not configured
    """
    try:
        # Look for any Item Attribute with custom_product_grade_attribute flag enabled
        grade_attr = frappe.db.get_value(
            "Item Attribute",
            {"custom_product_grade_attribute": 1},
            "attribute_name"
        )
        
        if grade_attr:
            frappe.logger().debug(f"Dynamic grade attribute found: {grade_attr}")
            return grade_attr
        
        frappe.logger().warn("No Item Attribute with custom_product_grade_attribute flag found, falling back to 'Grade'")
        return "Grade"  # Fallback to default
    except Exception as e:
        frappe.logger().error(f"Error getting grade attribute: {str(e)}")
        return "Grade"  # Fallback to default on error

def get_grade_value(variant):
    """
    Get the grade value from variant attributes
    Dynamically determines which attribute to look for based on custom_product_grade_attribute flag
    """
    grade_attribute = get_grade_attribute_name()
    
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
    """
    Set variant item code and name based on the dynamic grade attribute
    Uses custom_product_grade_attribute to determine which attribute is the grade
    """
    grade = get_grade_value(variant)

    if not grade:
        make_variant_item_code(template.item_code, template.item_name, variant)
        return

    base_code = f"{template.item_code}-{grade}"
    base_name = f"{template.item_name}-{grade}"

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
    args = frappe.parse_json(args)

    template = frappe.get_doc("Item", item)
    variant = frappe.new_doc("Item")
    variant.variant_based_on = "Item Attribute"

    variant_attributes = []
    for d in template.attributes:
        # If the frontend didn't pass this attribute, it will safely be None
        val = args.get(d.attribute) or args.get(_(d.attribute))
        variant_attributes.append({
            "attribute": d.attribute,
            "attribute_value": val
        })

    variant.set("attributes", variant_attributes)
    copy_attributes_to_variant(template, variant)

    if use_template_image and template.image:
        variant.image = template.image

    set_variant_name_from_grade(template, variant)

    grade = get_grade_value(variant)
    if grade:
        grade_doc = create_or_get_product_grade(grade)
        variant.custom_item_grade = grade_doc

    variant.insert(ignore_permissions=True)
    return variant

@frappe.whitelist()
def create_multiple_variants(item, args, use_template_image=False):
    """
    Create multiple item variants with dynamic grade attribute support
    Uses custom_product_grade_attribute flag to determine the grade attribute
    """
    created_count = 0
    skipped_count = 0
    failed_count = 0
    log = []

    parsed_args = frappe.parse_json(args)
    grade_attribute = get_grade_attribute_name()
    
    # CRITICAL FIX: Strip out any keys that have empty lists so they don't break the math!
    clean_args = {k: v for k, v in parsed_args.items() if v and len(v) > 0}

    args_set = generate_keyed_value_combinations(clean_args)

    for attribute_values in args_set:
        existing_variant = get_variant(item, args=attribute_values)
        
        # Get grade value dynamically
        grade_value = attribute_values.get(grade_attribute, 'Unknown')
        
        if existing_variant:
            skipped_count += 1
            log.append(f"<b>Skipped:</b> {grade_value} (Already exists as {existing_variant})")
        else:
            try:
                create_variant(item, attribute_values, use_template_image)
                created_count += 1
                log.append(f"<b>Success:</b> Created variant for {grade_value}")
            except Exception as e:
                frappe.db.rollback()
                failed_count += 1
                log.append(f"<span style='color:red'><b>Failed:</b> {grade_value} -> Error: {str(e)}</span>")

    return f"{created_count} variants created."

@frappe.whitelist()
def enqueue_multiple_variant_creation(item, args, use_template_image=False):
    use_template_image = frappe.parse_json(use_template_image)
    parsed_args = frappe.parse_json(args)

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