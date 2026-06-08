import json
from django import template

register = template.Library()


@register.filter(name='to_json')
def to_json(value):
    """Convert a Python object to JSON string for use in templates."""
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return '{}'


@register.filter(name='get_item')
def get_item(dictionary, key):
    """Get an item from a dictionary in templates."""
    if isinstance(dictionary, dict):
        return dictionary.get(key)
    return None


@register.filter(name='percentage')
def percentage(value, total):
    """Calculate percentage."""
    try:
        return round((float(value) / float(total)) * 100, 1)
    except (ValueError, ZeroDivisionError):
        return 0
