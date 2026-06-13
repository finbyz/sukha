import frappe

def on_update(doc, method):

    if not doc.custom_contact_person:
        return

    # Check if link already exists in tabDynamic Link
    exists = frappe.db.exists("Dynamic Link", {
        "parent": doc.custom_contact_person,
        "parenttype": "Contact",
        "parentfield": "links",
        "link_doctype": "Lead",
        "link_name": doc.name
    })

    if not exists:
        link = frappe.new_doc("Dynamic Link")
        link.parent = doc.custom_contact_person
        link.parenttype = "Contact"
        link.parentfield = "links"
        link.link_doctype = "Lead"
        link.link_name = doc.name
        link.link_title = doc.lead_name or doc.company_name or doc.name
        link.insert(ignore_permissions=True)
        frappe.clear_document_cache("Contact", doc.custom_contact_person)


@frappe.whitelist()
def link_contact_to_lead(contact_name, lead_name):
    if not contact_name or not lead_name:
        return
        
    if not frappe.db.exists("Contact", contact_name) or not frappe.db.exists("Lead", lead_name):
        return
        
    exists = frappe.db.exists("Dynamic Link", {
        "parent": contact_name,
        "parenttype": "Contact",
        "parentfield": "links",
        "link_doctype": "Lead",
        "link_name": lead_name
    })
    
    if not exists:
        lead = frappe.get_doc("Lead", lead_name)
        link = frappe.new_doc("Dynamic Link")
        link.parent = contact_name
        link.parenttype = "Contact"
        link.parentfield = "links"
        link.link_doctype = "Lead"
        link.link_name = lead_name
        link.link_title = lead.lead_name or lead.company_name or lead_name
        link.insert(ignore_permissions=True)
        frappe.clear_document_cache("Contact", contact_name)