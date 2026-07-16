pipeline {
  agent any

  parameters {
    string(name: 'ECR_REPO', defaultValue: '516008588803.dkr.ecr.us-east-1.amazonaws.com/k8s-cicd', description: 'ECR repository URI')
    string(name: 'AWS_REGION', defaultValue: 'us-east-1', description: 'AWS region')
    string(name: 'HELM_RELEASE', defaultValue: 'crud-app', description: 'Helm release name')
    string(name: 'NAMESPACE', defaultValue: 'default', description: 'Kubernetes namespace')
  }

  environment {
    KUBECONFIG = '/var/lib/jenkins/.kube/config'
    APP_DIR   = 'application'
    CHART_DIR = 'helm/crud-app'
    REGISTRY  = "${params.ECR_REPO.split('/')[0]}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.GIT_SHA = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.IMAGE = "${params.ECR_REPO}:${env.GIT_SHA}"
        }
        echo "Building ${env.IMAGE}"
      }
    }

    stage('Build Image') {
      steps {
        dir(env.APP_DIR) {
          sh "docker build -t ${env.IMAGE} ."
        }
      }
    }

    stage('Push to ECR') {
      steps {
        sh "aws ecr get-login-password --region ${params.AWS_REGION} | docker login --username AWS --password-stdin ${env.REGISTRY}"
        sh "docker push ${env.IMAGE}"
      }
    }

    stage('Refresh ECR Pull Secret') {
      steps {
        sh """
          kubectl create secret docker-registry ecr-creds \
            --docker-server=${env.REGISTRY} \
            --docker-username=AWS \
            --docker-password=\$(aws ecr get-login-password --region ${params.AWS_REGION}) \
            --namespace=${params.NAMESPACE} \
            --dry-run=client -o yaml | kubectl apply -f -
        """
      }
    }

    stage('Deploy') {
      steps {
        sh """
          helm upgrade --install ${params.HELM_RELEASE} ${env.CHART_DIR} \
            --namespace ${params.NAMESPACE} --create-namespace \
            --set image.tag=${env.GIT_SHA} \
            --atomic --timeout 3m
        """
      }
    }

    stage('Verify') {
      steps {
        sh "kubectl rollout status deployment/${params.HELM_RELEASE} -n ${params.NAMESPACE} --timeout=120s"
        sh "kubectl get svc ${params.HELM_RELEASE} -n ${params.NAMESPACE}"
      }
    }
  }

  post {
    success {
      echo "Deployed ${env.IMAGE} to ${params.NAMESPACE}"
    }
    failure {
      echo "Pipeline failed. Helm --atomic rolled back to the previous working release."
    }
    always {
      sh "docker rmi ${env.IMAGE} || true"
    }
  }
}
