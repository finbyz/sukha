app_name = "sukha"
app_title = "Sukha"
app_publisher = "kaustubh"
app_description = " "
app_email = "kaustubh.sharma@finbyz.tech"
app_license = "mit"

# Apps
# ------------------
fixtures = [
    {"dt": "Custom Field", "filters": [["module", "in", ["Sukha"]]]},
    {"dt": "Property Setter", "filters": [["module", "in", ["Sukha"]]]},
]
# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "sukha",
# 		"logo": "/assets/sukha/logo.png",
# 		"title": "Sukha",
# 		"route": "/sukha",
# 		"has_permission": "sukha.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/sukha/css/sukha.css"
# app_include_js = "/assets/sukha/js/sukha.js"

# include js, css files in header of web template
# web_include_css = "/assets/sukha/css/sukha.css"
# web_include_js = "/assets/sukha/js/sukha.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "sukha/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
    "Opportunity": "public/js/opportunity.js",
    "Lead": "public/js/lead.js",
    "Prospect": "public/js/prospect.js",
}
# doctype_list_js = {
#     "Lead": "public/js/lead_list.js"
# }
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "sukha/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "sukha.utils.jinja_methods",
# 	"filters": "sukha.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "sukha.install.before_install"
# after_install = "sukha.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "sukha.uninstall.before_uninstall"
# after_uninstall = "sukha.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "sukha.utils.before_app_install"
# after_app_install = "sukha.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "sukha.utils.before_app_uninstall"
# after_app_uninstall = "sukha.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "sukha.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#     "Prospect": {
#         "before_save": "sukha.doc_events.prospect.on_submit"
#     }
# }
# Override standard ERPNext methods
override_doctype_class = {
    "Lead": "sukha.override.lead_override.CustomLead"
}

# Override whitelisted methods
override_whitelisted_methods = {
    "erpnext.crm.doctype.lead.lead.make_opportunity": "sukha.override.lead_override.make_opportunity"
}


# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"sukha.tasks.all"
# 	],
# 	"daily": [
# 		"sukha.tasks.daily"
# 	],
# 	"hourly": [
# 		"sukha.tasks.hourly"
# 	],
# 	"weekly": [
# 		"sukha.tasks.weekly"
# 	],
# 	"monthly": [
# 		"sukha.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "sukha.install.before_tests"

# Extend DocType Class
# ------------------------------
#

# Specify custom mixins to extend the standard doctype controller.


# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "sukha.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "sukha.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "sukha.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["sukha.utils.before_request"]
# after_request = ["sukha.utils.after_request"]

# Job Events
# ----------
# before_job = ["sukha.utils.before_job"]
# after_job = ["sukha.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"sukha.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

