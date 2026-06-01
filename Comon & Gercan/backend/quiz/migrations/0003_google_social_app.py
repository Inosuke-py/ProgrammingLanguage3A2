from django.db import migrations


def create_google_social_app(apps, schema_editor):
    Site = apps.get_model("sites", "Site")
    SocialApp = apps.get_model("socialaccount", "SocialApp")

    site, _ = Site.objects.get_or_create(
        id=1,
        defaults={"domain": "127.0.0.1:8000", "name": "PRAXIS Local"},
    )
    if site.domain == "example.com":
        site.domain = "127.0.0.1:8000"
        site.name = "PRAXIS Local"
        site.save(update_fields=["domain", "name"])

    app, _ = SocialApp.objects.get_or_create(
        provider="google",
        name="Google OAuth",
        defaults={"client_id": "", "secret": "", "key": ""},
    )
    app.sites.add(site)


def remove_google_social_app(apps, schema_editor):
    SocialApp = apps.get_model("socialaccount", "SocialApp")
    SocialApp.objects.filter(provider="google", name="Google OAuth").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("quiz", "0002_quiz_owner"),
        ("sites", "0002_alter_domain_unique"),
        ("socialaccount", "0006_alter_socialaccount_extra_data"),
    ]

    operations = [
        migrations.RunPython(create_google_social_app, remove_google_social_app),
    ]
