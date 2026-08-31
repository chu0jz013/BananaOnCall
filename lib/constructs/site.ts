import { Construct } from 'constructs';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib/core';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';

export interface StatusSiteProps {
  readonly isLocal: boolean;
  /** Fixed locally so `make web-deploy` knows where to sync without a lookup. */
  readonly bucketName?: string;
}

/**
 * S3 static website hosting for the public status board (FR-8.3).
 *
 * Plain S3 rather than S3 + CloudFront, for two reasons: `cloudfront` is not in
 * LocalStack Community, so a CloudFront-fronted site could not be exercised
 * locally at all; and the board is public data by definition, so there is
 * nothing here an origin-access identity would be protecting.
 *
 * Before this fronts a real domain it wants CloudFront in front of it for TLS
 * and caching — S3 website endpoints are HTTP-only.
 *
 * The site is multi-page on purpose. S3 website hosting answers an unknown path
 * with the error document *and a 404 status*; SPA routing would need CloudFront
 * to rewrite that to a 200. Two real documents avoid the problem entirely.
 */
export class StatusSite extends Construct {
  readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: StatusSiteProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      blockPublicAccess: new BlockPublicAccess({
        blockPublicAcls: true,
        ignorePublicAcls: true,
        // A public bucket policy is the entire mechanism of website hosting.
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      removalPolicy: props.isLocal ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      // Deliberately not autoDeleteObjects: that provisions a custom-resource
      // Lambda, and locally the whole account is wiped by `make down` anyway.
    });

    new CfnOutput(scope, 'SiteBucket', { value: this.bucket.bucketName });
    new CfnOutput(scope, 'SiteUrl', { value: this.bucket.bucketWebsiteUrl });
  }

  /** The website endpoint as LocalStack serves it, and as a browser resolves it. */
  static localUrl(bucketName: string): string {
    return `http://${bucketName}.s3-website.localhost.localstack.cloud:4566`;
  }
}
