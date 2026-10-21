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

    parameters {
        booleanParam(name: 'RUN_VISUAL', defaultValue: false, description: 'Run Midscene visual checks (requires approved model credentials).')
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
                // 默认门禁只运行本地确定性 smoke，不需要业务站点或模型密钥。
                CI = 'true'
            }
            steps {
                sh 'npm run typecheck'
                // 在启动浏览器前解析并验证全部运行配置，避免错误目标开始执行用例。
                sh 'npx playwright test --list --project=smoke'
                sh 'npm test'
            }
        }

        stage('Optional visual checks') {
            when { expression { return params.RUN_VISUAL } }
            environment {
                OPENAI_API_KEY = credentials('OPENAI_API_KEY')
                MIDSCENE_MODEL_NAME = credentials('MIDSCENE_MODEL_NAME')
                CI = 'true'
            }
            steps {
                sh 'npm run test:ai'
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
