// Jenkins pipeline installs the browser runtime, runs E2E checks, and always archives diagnostics.
pipeline {
    agent {
        docker {
            image 'node:22-bookworm'
            args '-u root'
        }
    }

    options {
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
        timestamps()
    }

    stages {
        stage('Install dependencies and browser') {
            steps {
                sh 'npm ci'
                sh 'npx playwright install --with-deps chromium'
            }
        }

        stage('Run UI automation') {
            environment {
                // Credentials are scoped to this stage and never required by the standalone browser smoke.
                OPENAI_API_KEY = credentials('OPENAI_API_KEY')
                APP_BASE_URL = credentials('APP_BASE_URL')
                OPENAI_BASE_URL = 'https://api.openai.com/v1'
                MIDSCENE_MODEL_NAME = 'gpt-4o'
                CI = 'true'
            }
            steps {
                sh 'npm run typecheck'
                sh 'npm test'
            }
        }
    }

    post {
        always {
            archiveArtifacts(
                artifacts: 'playwright-report/**/*, midscene_report/**/*, test-results/**/*',
                fingerprint: true,
                allowEmptyArchive: true
            )
            junit allowEmptyResults: true, testResults: 'test-results/**/*.xml'
        }
    }
}
