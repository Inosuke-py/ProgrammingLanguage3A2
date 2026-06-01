def google_oauth_status(request):
    try:
        from allauth.socialaccount.models import SocialApp

        app = SocialApp.objects.filter(provider="google").first()
        ready = bool(app and app.client_id and app.secret)
    except Exception:
        ready = False

    return {"google_oauth_ready": ready}
