import os

AUTHENTICATION_SOURCES = ['oauth2']

# Only the pre-provisioned user (kalyan@kontracts.pro, see .env.pgadmin) may log in.
# Any other GitHub account can complete OAuth but pgAdmin rejects it since no
# matching local user exists.
OAUTH2_AUTO_CREATE_USER = False

OAUTH2_CONFIG = [
    {
        'OAUTH2_NAME': 'github',
        'OAUTH2_DISPLAY_NAME': 'GitHub',
        'OAUTH2_CLIENT_ID': os.environ['GITHUB_OAUTH_CLIENT_ID'],
        'OAUTH2_CLIENT_SECRET': os.environ['GITHUB_OAUTH_CLIENT_SECRET'],
        'OAUTH2_TOKEN_URL': 'https://github.com/login/oauth/access_token',
        'OAUTH2_AUTHORIZATION_URL': 'https://github.com/login/oauth/authorize',
        'OAUTH2_API_BASE_URL': 'https://api.github.com/',
        'OAUTH2_USERINFO_ENDPOINT': 'user',
        'OAUTH2_SCOPE': 'user:email',
        'OAUTH2_USERNAME_CLAIM': 'login',
        'OAUTH2_ICON': 'fa-github',
        'OAUTH2_BUTTON_COLOR': '#3253a8',
    },
]
